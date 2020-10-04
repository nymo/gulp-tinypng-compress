[![Version](https://img.shields.io/npm/v/gulp-tinypng-extended.svg)][npm]
[![Downloaded](https://img.shields.io/npm/dm/gulp-tinypng-extended.svg)][npm]
[![Build](https://img.shields.io/travis/nymo/gulp-tinypng-extended.svg)][travis]

# gulp-tinypng-extended

> [TinyPNG](https://tinypng.com) API wrapper for compressing PNG & JPG images

An actively maintained & developed fork of [gulp-tinypng-compress](https://github.com/stnvh/gulp-tinypng-compress).

## Main differences from gulp-tinypng-compress
- Added new option (keepMetadata) to preserve metadata. Currently only copyright and creation date is supported.
- Added new option (keepOriginal) to override the original image instead of creating a new compressed file in the output path.
- Updated minimatch plugin to current version to avoid deprecated warnings.
- Fixed Problem with Bad Gateway errors receiving from the api. On error the plugin tries on default 10 times a reattempt and simply skips the image if the server is still not reachable (Thanks to @kevinranks)
compressing the next images.
- On error the signature file is still being written for all successfully compressed files.
- Added check for empty or broken images to be skipped and not send

## Install
*Requires node `10.x.x` or above*

Install with [npm](https://npmjs.org/package/gulp-tinypng-extended) - In your project folder, run:

```
npm install gulp-tinypng-extended
```

To run tests:

```
npm test
```

## Example

```js
var gulp = require('gulp');
var plumber = require('gulp-plumber');
var tinypng = require('gulp-tinypng-extended');

gulp.task('tinypng', function () {
	return gulp.src('images/src/**/*.{png,jpg,jpeg}')
		.pipe(plumber())
		.pipe(tinypng({
			key: 'API_KEY',
			sigFile: 'images/.tinypng-sigs',
			log: true
		}))
		.pipe(gulp.dest('images'));
});
```

## API

### tinypng([options])

Returns Stream containing compressed images

#### options
Type: `Object` / `String`
Default: `false`

Sets options described below from its properties. If type is not object, string presumed (the API key)

#### options.key
Type: `String`
Default: `''`

Your TinyPNG API key to use for requests

#### options.sigFile
Type: `String`
Default: `''`

If set to a filename, it will compare existing source file md5 signatures against those found in the file's json data. When the signatures match, the file is skipped from being minified again, allowing you to better stay within your API request limits. When an image is minified, the md5 signature is determined from the unminified source image and written to the file at options.sigFile (a suggested location would be somewhere under your source control).

Signatures are based off the unminified source image, so that when the source changes it will be re-minified and re-written to the destination file.

#### options.sameDest
Type: `Boolean`
Default `false`

If your source is the same as your destination (images are written over themselves), and you want to use the signature checking feature, set this to true

>**Note:** If your source and destination are the same, it's recommended you use this, and `options.sigFile`, as it prevents you from continually uploading already compressed images each time you run the task

#### options.keepOriginal
Type: `Boolean`
Default `True`

With this option you can tell the plugin to override your original file with the compressed one. The gulp.dest() output
path for the images is then being ignored. 

#### options.keepMetadata
Type: `Boolean`
Default `False`

If you want to keep the metadata in the compressed image then you should set this option to true. Because this adds
some additional bytes to the compressed file it is disabled by default.

#### options.summarize/summarise
Type: `Boolean`
Default: `false`

Outputs statistics once all images have been handled.
```bash
[09:47:43] gulp-tinypng-extended Skipped: 0 images, Compressed: 1 image, Savings: 3.98 KB (ratio: 0.4109)
```

#### options.log
Type: `Boolean`
Default: `false`

Set to true to log errors & messages to the console. Errors are dispatched via events anyway, so plugins like `gulp-plumber` can handle these for you.

#### options.parallel
Type: `Boolean`
Default: `true`

Enables concurrent uploads to the TinyPNG server to speed up total compression time.

<sub>(thanks [HugoHeneault](https://github.com/HugoHeneault) for this feature suggestion)</sub>

#### options.parallelMax
Type: `Integer`
Default: `5`

The amount of concurrent uploads allowed at one time, increase if you/your request limits can handle it - very easy to max out your monthly requests, use with caution!

#### options.force
Type: `Boolean` / `String`
Default: `false`

Force compress images regardless of signature. Value can either be `true` to force all images, or a glob pattern string to match against the filename(s).

Can also be performed from the **command line**:
```bash
$ gulp png --force 'icon-*.png'
```

This feature was added as it's impossible to know where the files are being written to at this point in the stream, unless the directory is directly passed into the config (pretty ugly). So the option was added to force certain (or all) files to be compressed when required.

#### options.ignore
Type: `Boolean` / `String`
Default: `false`

Same as `options.force` except ignores files if the glob is matched

`--ignore` flag on the command line

#### options.retryAttempts
Type: `Integer`
Default: `10`

How many times to reattempt the upload if an error is encountered.

#### options.retryDelay
Type: `Integer`
Default: `10000`

How many milliseconds to delay before reattempting a failed upload.

### Deprecated/non-functional options

**options.checkSigs** - Removed in favor of `options.sigFile`


## License

Please refer to the [LICENSE](https://github.com/nymo/gulp-tinypng-extended/blob/master/LICENSE) file.

**Original license:**

>MIT © [Stan Hutcheon](https://github.com/stnvh)
>MIT © [Gaurav Jassal](http://gaurav.jassal.me)

[npm]: https://www.npmjs.com/package/gulp-tinypng-extended
[travis]: https://travis-ci.org/nymo/gulp-tinypng-extended
