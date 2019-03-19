var test = process.env.NODE_ENV == 'test',
    through = require('through2'),
    throughParallel = require('through2-concurrent'),
    chalk = require('ansi-colors'),
    request = require('requestretry'),
    path = require('path'),
    util = require('util'),
    fs = require('fs'),
    crypto = require('crypto'),
    minimatch = require('minimatch'),
    PluginError = require('plugin-error'),
    parseArgs = require('minimist')(process.argv.slice(2)),
    log = require('fancy-log');

var PLUGIN_NAME = 'gulp-tinypng-extended';

/**
 * TinyPNG class
 * @todo Move into own library
 */
function TinyPNG(opt, obj) {

    var self = this;

    this.conf = {
        token: null,
        options: {
            key: '',
            sigFile: false,
            log: false,
            force: false,
            ignore: false,
            sameDest: false,
            summarize: false,
            parallel: true,
            parallelMax: 5,
            keepOriginal: true,
            keepMetadata: false,
            retryAttempts: 10,
            retryDelay: 10000
        }
    };

    this.stats = {
        total: {
            in: 0,
            out: 0
        },
        compressed: 0,
        skipped: 0,
        retries: 0,
        retried: []
    };

    this.init = function(opt) {
        if(typeof opt !== 'object') opt = { key: opt };

        opt = util._extend(this.conf.options, opt);

        if(!opt.key) throw new PluginError(PLUGIN_NAME, 'Missing API key!');

        if(!opt.force) opt.force = parseArgs.force || false; // force match glob
        if(!opt.ignore) opt.ignore = parseArgs.ignore || false; // ignore match glob
        if(opt.summarise) opt.summarize = true; // chin chin, old chap!

        this.conf.options = opt; // export opts

        this.conf.token = Buffer.from('api:' + opt.key).toString('base64'); // prep key
        this.hash = new this.hasher(opt.sigFile).populate(); // init hasher class

        return this;
    };

    this.stream = function() {
        var self = this,
            opt = this.conf.options;

        return (opt.parallel ? throughParallel : through).obj({maxConcurrency: opt.parallelMax}, function(file, enc, cb) {
            if(self.utils.glob(file, opt.ignore)) return cb();

            if(file.isNull()) {
                return cb();
            }

            if(file.isStream()) {
                this.emit('error', new PluginError(PLUGIN_NAME, 'Streams not supported'));
                return cb();
            }

            if(file.isBuffer()) {
                var hash = null;

                if(opt.sigFile && !self.utils.glob(file, opt.force)) {
                    var result = self.hash.compare(file);

                    hash = result.hash;

                    if(result.match) {
                        self.utils.log('[skipping] ' + chalk.green('✔ ') + file.relative);
                        self.stats.skipped++;

                        return cb();
                    }
                }

                self.request(file).get(function(err, tinyFile) {
                    if(err) {
                        this.emit('error', new PluginError(PLUGIN_NAME, err));
                        return cb();
                    }

                    self.utils.log('[compressing] ' + chalk.green('✔ ') + file.relative + chalk.gray(' (done)'));
                    self.stats.compressed++;

                    self.stats.total.in += file.contents.toString().length;
                    self.stats.total.out += tinyFile.contents.toString().length;

                    if(opt.sigFile) {
                        var curr = {
                            file: file,
                            hash: hash
                        };

                        if(opt.sameDest) {
                            curr.file = tinyFile;
                            curr.hash = self.hash.calc(tinyFile);
                        }

                        self.hash.update(curr.file, curr.hash);
                    }
                    if (opt.keepOriginal === false) {
                        fs.writeFileSync(file.path, tinyFile.contents);
                    } else {
                        this.push(tinyFile);
                    }

                    return cb();
                }.bind(this)); // maintain stream context
            }
        })
        .on('error', function(err) {
            console.log(err.message);
            self.stats.skipped++;
            self.utils.log(err.message);
        })
        .on('end', function() {
            if(opt.sigFile) {
                // write sigs after complete or but also when error occured in order to keep track of already compressed files
                self.hash.write();
            }
            if(opt.summarize) {
                var stats = self.stats,
                    info = util.format('Skipped: %s image%s, Retries: %s, Compressed: %s image%s, Savings: %s (ratio: %s)',
                        stats.skipped,
                        stats.skipped == 1 ? '' : 's',
                        stats.retries,
                        stats.compressed,
                        stats.compressed == 1 ? '' : 's',
                        (self.utils.prettySize(stats.total.in - stats.total.out)),
                        (stats.total.in ? Math.round(stats.total.out / stats.total.in * 10000) / 10000 : 0)
                    );

                self.utils.log(info, true);

                if(stats.retries > 0) {
                    self.utils.log('Retry Attempts:', true);
                    stats.retried.forEach(function(item) {
                        self.utils.log(item.file + ': ' + item.attempts + ' attempts', true);
                    });
                }
            }
        });
    };

    this.request = function(file, cb) {
        var self = this;

        return {
            file: file,

            upload: function(cb) {
                var file = this.file;

                //do not process empty files
                if(file.contents <= 0) {
                    err = new Error('Error: Empty or broken images could not be send ' + file.relative);
                    return cb(err);
                }

                request.post({
                    url: 'https://api.tinify.com/shrink',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': 'Basic ' + self.conf.token
                    },
                    strictSSL: false,
                    body: file.contents,
                    maxAttempts: self.conf.retryAttempts,
                    retryDelay: self.conf.retryDelay,
                    retryStrategy: request.RetryStrategies.HTTPOrNetworkError // (default) retry on 5xx or network errors
                }, function(err, res, body) {
                    var data,
                        info = {
                            url: false,
                            count: (res && 'headers' in res && res.headers['compression-count']) || 0
                        };
                    if(res && res.attempts > 1){
                        self.stats.retries += res.attempts - 1;
                        self.stats.retried.push({
                            file: file.relative,
                            attempts: res.attempts
                        });
                    }

                    if(err) {
                        err = new Error('Upload failed for ' + file.relative + ' with error: ' + err.message);
                    } else if(body) {
                        if(res.statusCode == 200 || res.statusCode == 201) {
                            try {
                                data = JSON.parse(body);
                            } catch(e) {
                                err = new Error('Upload response JSON parse failed, invalid data returned from API. Failed with message: ' + e.message);
                            }

                            if(!err) {
                                if(data.error){
                                    err = this.handler(data, res.statusCode);
                                } else if (data.output.url) {
                                    info.url = self.conf.options.keepMetadata ? res.headers.location : data.output.url;
                                } else {
                                    err = new Error('Invalid TinyPNG response object returned for ' + file.relative);
                                }
                            }
                        } else {
                            err = new Error('Error: Statuscode ' + res.statusCode + ' returned');
                        }
                    } else {
                        err = new Error('No content returned from TinyPNG API for' + file.relative);
                    }

                    cb(err, info);
                }.bind(this));
            },

            download: function(url, cb) {
                var options = {
                    url: url,
                    encoding: null
                };

                if (self.conf.options.keepMetadata) {
                    options.json = { preserve: ["copyright", "creation"] };
                    options.headers = {
                        'Authorization': 'Basic ' + self.conf.token
                    };
                }
                request.get(options, function(err, res, body) {
                    err = err ? new Error('Download failed for ' + url + ' with error: ' + err.message) : false;
                    var buffer = false;
                     try {
                        buffer = Buffer.from(body);
                    } catch(err) {
                        return cb(new Error('Empty Body for Download with error: ' + err.message));
                    }

                    return cb(err, buffer);
                });
            },

            handler: function(data, status) {
                return new Error((data.error || 'Unknown') + ' (' + status + '): ' + (data.message || 'No message returned') + ' for ' + file.relative);
            },

            get: function(cb) {
                var self = this,
                    file = this.file;

                self.upload(function(err, data) {
                    if(err) return cb(err, file);

                    self.download(data.url, function(err, data) {
                        if(err) return cb(err, file);

                        var tinyFile = file.clone();
                        tinyFile.contents = data;

                        cb(false, tinyFile);
                    });
                });

                return this;
            }
        };
    };

    this.hasher = function(sigFile) {
        return {
            sigFile: sigFile || false,
            sigs: {},

            calc: function(file, cb) {
                var md5 = crypto.createHash('md5').update(file.contents).digest('hex');

                cb && cb(md5);

                return cb ? this : md5;
            },
            update: function(file, hash) {
                this.changed = true;
                this.sigs[file.path.replace(file.cwd, '')] = hash;

                return this;
            },
            compare: function(file, cb) {

                var md5 = this.calc(file),
                    filepath = file.path.replace(file.cwd, ''),
                    result = (filepath in this.sigs && md5 === this.sigs[filepath]);

                cb && cb(result, md5);

                return cb ? this : { match: result, hash: md5 };
            },
            populate: function() {
                var data = false;

                if(this.sigFile) {
                    try {
                        data = fs.readFileSync(this.sigFile, 'utf-8');
                        if(data) data = JSON.parse(data);
                    } catch(err) {
                        // meh
                    }

                    if(data) this.sigs = data;
                }

                return this;
            },
            write: function() {
                if(this.changed) {
                    try {
                        fs.writeFileSync(this.sigFile, JSON.stringify(this.sigs));
                    } catch(err) {
                        // meh
                    }
                }

                return this;
            }
        };
    };

    this.utils = {
        log: function(message, force) {
            if(self.conf.options.log || force) log(PLUGIN_NAME, message);

            return this;
        },

        glob: function(file, glob, opt) {
            opt = opt || {};
            var result = false;

            if(typeof glob === 'boolean') return glob;

            try {
                result = minimatch(file.path, glob, opt);
            } catch(err) {}

            if(!result && !opt.matchBase) {
                opt.matchBase = true;
                return this.glob(file, glob, opt);
            }
            return result;
        },

        prettySize: function(bytes) {
            if(bytes === 0) return '0.00 B';

            var pos = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, pos)).toFixed(2) + ' ' + ' KMGTP'.charAt(pos) + 'B';
        }
    };

    return (obj || test) ? this.init(opt) : this.init(opt).stream();
}

module.exports = TinyPNG;
