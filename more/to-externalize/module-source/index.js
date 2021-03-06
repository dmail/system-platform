/*

*/

/* global URL */
/* env browser, node */

import env from 'env';
import proto from 'env/proto';
import fetchAsText from 'env/fetch-as-text';

import SourceMap from 'source-map';

// get real file name from sourceURL comment
function findSourceUrl(source) {
    var lastMatch;
    var match;
    var sourceURLRegexp = /\/\/#\s*sourceURL=\s*(\S*)\s*/mg;
    while (match = sourceURLRegexp.exec(source)) { // eslint-disable-line
        lastMatch = match;
    }

    return lastMatch ? lastMatch[1] : null;
}

function findSourceMappingURL(source) {
    // Keep executing the search to find the *last* sourceMappingURL to avoid
    // picking up sourceMappingURLs from comments, strings, etc.
    var lastMatch;
    var match;
    // eslint-disable-next-line
    var sourceMappingURLRegexp = /(?:\/\/[@#][ \t]+sourceMappingURL=([^\s'"]+?)[ \t]*$)|(?:\/\*[@#][ \t]+sourceMappingURL=([^\*]+?)[ \t]*(?:\*\/)[ \t]*$)/mg;
    while (match = sourceMappingURLRegexp.exec(source)) { // eslint-disable-line
        lastMatch = match;
    }

    return lastMatch ? lastMatch[1] : null;
}

function isBase64Url(url) {
    var base64SourceMapRegexp = /^data:application\/json[^,]+base64,/;

    return base64SourceMapRegexp.test(url);
}

let File = proto.extend('File', {
    url: null,
    content: null,
    // result: null,

    constructor(url) {
        this.url = url;
    },

    eval(content) {
        return content;
    },

    setContent(content) {
        if (this.content !== content) {
            this.content = content;
            this.eval(content);
        }
    },

    fetch() {
        let fetchPromise;

        if (this.hasOwnProperty('fetchPromise')) {
            fetchPromise = this.fetchPromise;
        } else {
            if (this.content) {
                fetchPromise = Promise.resolve(this.content);
            } else {
                fetchPromise = fetchAsText(this.url);
            }

            this.fetchPromise = fetchPromise;
        }

        // engine.debug('the sourcemap url is', sourceMapURL);
        return fetchPromise;
    },

    createImportPromise() {
        return this.fetch().then(function(content) {
            return this.setContent(content);
        }.bind(this));
    },

    import() {
        let importPromise;

        if (this.hasOwnProperty('importPromise')) {
            importPromise = this.importPromise;
        } else {
            importPromise = this.createImportPromise();
            this.importPromise = importPromise;
        }

        return importPromise;
    }
});

var SourceMapConsumer = SourceMap.SourceMapConsumer;

let SourceMapFile = File.extend('SourceMap', {
    // origins: null,

    eval(content) {
        var map = JSON.parse(content);
        var sourceRoot;
        if ('sourceRoot' in map) {
            sourceRoot = map.sourceRoot;
        }
        var file;
        if ('file' in map) {
            file = map.file;
            if (file) {
                // allow relative file to the map location
                file = new URL(map.file, this.url).href;
                map.file = file;
            }
        }
        var sources;
        if ('sources' in map) {
            sources = map.sources;

            if (sources) {
                if (sourceRoot) {
                    sources = sources.map(function(source) {
                        return new URL(source, sourceRoot).href;
                    });
                    map.sources = sources;
                }

                // allow source to be relative to the sourcemap location
                sources = sources.map(function(source) {
                    return new URL(source, this.url).href;
                }, this);
                map.sources = sources;
            }
        }
        var sourcesContent;
        if ('sourcesContent' in map) {
            sourcesContent = map.sourcesContent;
        }

        if (sources) {
            // console.log('origins of', this.url, 'are', sources);
            this.origins = sources.map(function(source) {
                // console.log('locate origin at', originURL, 'from', source);
                return this.sources.get(source); // eslint-disable-line
            }, this);

            // check is sourceContent is embeded in the sourcemap
            if (sourcesContent) {
                sourcesContent.forEach(function(sourceContent, index) {
                    this.origins[index].setContent(sourceContent);
                }, this);
            }
        } else if (file) {
            this.origins = [
                this.sources.get(file) // eslint-disable-line
            ];
        } else {
            this.origins = [];
        }

        this.data = map;
        this.consumer = new SourceMapConsumer(map);

        return this.consumer;
    }
});

let FileSource = File.extend('FileSource', {
    origins: null,
    generated: null,
    prepared: false,

    constructor(url) {
        url = new URL(url, env.baseURL).href;
        File.constructor.call(this, url);
    },

    eval(content) {
        /*
        var sourceURL = findSourceUrl(content);
        if (sourceURL) {
            var url = this.url;
            // console.log('resolve source url', sourceURL, 'for', this.url);
            var fullSourceURL = new URL(sourceURL, url).href;

            // else it would create circular redirection
            if (url !== fullSourceURL) {
                // this.redirections[url] = fullSourceURL;
                delete this.cache[url];
                this.cache[fullSourceURL] = this;
                this.url = fullSourceURL;

                // tell the origin that it depends on this
                // var origin = FileSource.create(url);
                // origin.generated = this;
            }
        }
        */

        var sourceMapURL = findSourceMappingURL(content);
        if (sourceMapURL) {
            if (this.url === System.paths.babel) {
                // ignore sourceMapURL for browser.js file of babel, it contains a comment
                // that matches findSourceMappingURL(content) but the file is not sourceMapped
                // it's a false positive
                // the check may be a bit more smart by being disabled for anything which is obviously not transpiled by babel
                // for now just keep like that
            } else if (isBase64Url(sourceMapURL)) {
                // Support source map URL as a data url
                var rawData = sourceMapURL.slice(sourceMapURL.indexOf(',') + 1);
                sourceMapURL = this.url;
                this.sourceMap = SourceMapFile.create(sourceMapURL);
                this.sourceMap.setContent(new Buffer(rawData, 'base64').toString());

                // console.log('set sourcemap for', this.url, 'from base64');
            } else {
                sourceMapURL = new URL(sourceMapURL, this.url).href; // allow source map urls to be relative to the sourceURL
                this.sourceMap = SourceMapFile.create(sourceMapURL);
            }
        }

        return content;
    },

    prepare() {
        var preparePromise;

        if (this.hasOwnProperty('preparePromise')) {
            preparePromise = this.preparePromise;
        } else {
            preparePromise = Promise.resolve().then(function() {
                return this.import();
            }.bind(this)).then(function() {
                var sourceMap = this.sourceMap;

                if (sourceMap) {
                    return sourceMap.import().then(function() {
                        // a file may refer to multiple sources, that's why this.origin should be an array like
                        // this origins = []; array of file used to generate this one
                        // all origin files must be prepared as well in that case

                        var originsPromises = sourceMap.origins.map(function(origin) {
                            // console.log('preparing origin', origin.url, 'from source', this.url);
                            return origin.prepare(true);
                        }, this);

                        return Promise.all(originsPromises);
                    }.bind(this));
                }
            }.bind(this)).then(function() {
                this.prepared = true;
            }.bind(this));

            this.preparePromise = preparePromise;
        }

        return preparePromise;
    },

    getOriginalSource() {
        if (!this.prepared) {
            throw new Error('getOriginalSource() must be called on prepared filesource');
        }

        let originalSource = '';
        if (this.sourceMap) {
            originalSource = this.sourceMap.origins.map(function(origin) {
                return origin.getOriginalSource();
            }).join('');
        } else {
            originalSource = this.content;
        }

        return originalSource;
    },

    getOriginalPosition(position) {
        if (!this.prepared) {
            throw new Error('getOriginalPosition() must be called on prepared filesource');
        }

        let originalPosition;

        if (this.sourceMap) {
            // now I have the original position for this I may realize that this
            let sourceMapPosition = this.sourceMap.consumer.originalPositionFor(position);

            if (sourceMapPosition && sourceMapPosition.source) {
                // ok get the orignal postion for this source
                var sourceOrigin = this.sourceMap.origins.find(function(origin) {
                    return origin.url === sourceMapPosition.source;
                });

                if (!sourceOrigin) {
                    throw new Error(
                        'sourceMap says original position source is ' +
                        sourceMapPosition.source + ' but this source is not part of origins'
                    );
                }

                return sourceOrigin.getOriginalPosition({
                    source: sourceMapPosition.source,
                    line: sourceMapPosition.line,
                    name: sourceMapPosition.name,
                    bias: position.bias,
                    column: sourceMapPosition.column
                });
            }
        } else {
            originalPosition = position;
        }

        return originalPosition;
    }
});

const sources = {
    map: {},

    has(url) {
        return url in this.map;
    },

    set: function(url, content) {
        var sourceURL = findSourceUrl(content);
        var fileSourceURL;

        if (sourceURL) {
            fileSourceURL = new URL(sourceURL, url).href;
        } else {
            fileSourceURL = url;
        }

        var fileSource = this.get(fileSourceURL);
        fileSource.setContent(content);
        return fileSource;
    },

    get: function(url) {
        var fileSource;

        if (this.has(url)) {
            fileSource = this.map[url];
        } else {
            fileSource = FileSource.create(url);
            this.map[fileSource.url] = fileSource;
        }

        return fileSource;
    },

    delete(url) {
        if (this.has(url)) {
            delete this.map[url];
        }
    }
};

File.sources = sources;

/*
import sources from 'env/file-source';

return Promise.resolve().then(function() {
    // this is just a way to make things faster because we already go the transpiledSource without having to query the filesystem
    // for now I'll just disable this because it's only for perf reason
    // -> no because I have to enable this for anonymous module anyway
    var System = this.System;
    var self = this;

    // sources va passer dans env et pas jsenv
    // puisque chaque env aura ses propres sources

    // any future fetch hook must call sources.set
    var fetch = System.fetch;
    System.fetch = function(load) {
        return fetch.call(this, load).then(function(source) {
            // console.log('translate', load.source);
            // if (self.mainURI && load.address === self.mainURI.toString()) {
            //     // console.log('main source', load.source, 'source', source);
            //     source = 'debugger;\n' + source;
            // }
            self.sources.set(load.address, load.source);
            return source;
        });
    };

    // any future translate hook must call sources.set
    var translate = System.translate;
    System.translate = function(load) {
        return translate.call(this, load).then(function(transpiledSource) {
            var loadMetadata = load.metadata;
            var loadFormat = loadMetadata.format;
            if (loadFormat !== 'json') {
                self.sources.set(load.address, transpiledSource);
                // we could speed up sourcemap by reading it from load.metadata.sourceMap;
                // but systemjs set it to undefined after transpilation (load.metadata.sourceMap = undefined)
                // saying it's now useless because the transpiled embeds it in base64
                // https://github.com/systemjs/systemjs/blob/master/dist/system.src.js#L3578
                // I keep this commented as a reminder that sourcemap could be available using load.metadata
                // I may open an issue on github about this, fore as it's only a perf issue I think it will never happen
                // function readSourceMapFromModuleMeta() { }
            }
            return transpiledSource;
        });
    };

    // to review :
    // we should warn when two different things try to add a source for a given module
    // for instance if moduleSource.set('test.js', 'source') is called while there is already
    // a source for test.js we must throw because it's never supposed to happen
    // it's not a big error but it means there is two something to improve and maybe something wrong
    // we should store source found in sourcemap in module-source, maybe not according to above
    // but if the source is supposed to exists then check that it does exists (keep in mind nested sourcemap)
    // finally stackTrace.firstCallSite.loadFile will try to load a file that may be accessible in moduleSources so check it
}.bind(this))
*/

export default sources;
