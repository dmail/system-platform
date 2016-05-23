import jsenv from 'jsenv';
import CallSite from './lib/callsite.js';
import parseStack from './lib/stack-parse.js';

function is(error) {
    return error && 'stack' in error;
}

// https://github.com/v8/v8/wiki/Stack%20Trace%20API
function getFrameProperties(frame) {
    var methodProperties = {
        getThis: 'thisValue',
        isNative: 'fromNative',
        isConstructor: 'fromConstructor',
        isToplevel: 'fromTopLevel',
        isEval: 'fromEval',
        getFunctionName: 'functionName',
        getMethodName: 'methodName',
        getTypeName: 'typeName',
        getLineNumber: 'lineNumber',
        getColumnNumber: 'columnNumber',
        getFileName: 'fileName',
        getScriptNameOrSourceURL: 'sourceURL'
    };
    var properties = {};

    Object.keys(methodProperties).forEach(function(method) {
        if ((method in frame) === false) {
            throw new Error(method + ' frame method not found');
        }

        var propertyName = methodProperties[method];
        var frameValue;

        try {
            frameValue = frame[method]();
        } catch (e) {
            frameValue = undefined;
            // console.warn('frame method error', e);
        }

        properties[propertyName] = frameValue;
    });

    if (false && frame.isEval()) {
        var evalFrame = frame.getEvalOrigin();

        console.log('-----', evalFrame, Object.keys(evalFrame));

        properties.fileName = evalFrame.getFileName();
        properties.lineNumber = evalFrame.getLineNumber();
        properties.columnNumber = evalFrame.getColumnNumber();
    }

    return properties;
}

var StackTrace = {
    constructor: function(error, v8CallSites) {
        if (typeof error === 'string') {
            error = {stack: error};
        }

        if (is(error)) {
            if (v8CallSites) {
                this.name = error.name;
                this.message = error.message;
                this.callSites = v8CallSites.map(function(frame) {
                    var properties = getFrameProperties(frame);
                    return CallSite.create(properties);
                });
            } else {
                this.stack = error.stack;
                if ('origin' in error && typeof error.origin === 'object') {
                    this.unshift(error.origin);
                }
                this.error = error;

                // this.name = error.name;
                // this.message = error.message;
                // if( error.fileName ){
                //     Object.defineProperty(this, 'fileName', {value: error.fileName});
                // }
                // if( error.lineNumber ){
                //    this.lineNumber = error.lineNumber;
                //     Object.defineProperty(this, 'lineNumber', {value: error.fileName});
                // }
                // if( error.columnNumber ){
                //     this.columnNumber = error.columnNumber;
                // }
            }
        } else {
            this.callSites = [];
        }

        this.callSites = this.callSites.filter(function(callSite) {
            return callSite.getFunctionName().endsWith('__notrace__') === false;
        });

        if (this.callSiteFilter) {
            this.callSites = this.callSites.filter(this.callSiteFilter);
        }

        if (this.callSiteTransformer) {
            this.callSites.forEach(this.callSiteTransformer);
        }
    },

    create: function() {
        var stackTrace = Object.create(this);
        stackTrace.constructor.apply(stackTrace, arguments);
        return stackTrace;
    },

    get stack() {
        var stack = '';

        stack += this.name;
        if (this.message) {
            stack += ': ' + this.message;
        }
        stack += this.callSites.map(function(callSite) {
            return '\n\tat ' + String(callSite);
        }).join('');

        return stack;
    },

    set stack(value) {
        var parts = parseStack(value);

        this.name = parts.name;
        this.message = parts.message;
        this.trace = parts.trace;

        this.callSites = this.trace.split('\n').slice(1).map(function(line) {
            return CallSite.parse(line);
        }).filter(function(callSite) {
            return Object.keys(callSite).length !== 0;
        }); // filter out empty callSites
    },

    get fileName() {
        return this.callSites[0] ? this.callSites[0].getFileName() : null;
    },

    // set fileName(value){
    //     if( !this.calllSites[0] ) this.callSites[0] = CallSite.create();
    //     this.calllSites[0].fileName = value;
    // },

    get lineNumber() {
        return this.callSites[0] ? this.callSites[0].getLineNumber() : null;
    },

    get columnNumber() {
        return this.callSites[0] ? this.callSites[0].getColumnNumber() : null;
    },

    forEach: function(fn, bind) {
        this.callSites.forEach(fn, bind);
    },

    unshift: function(origin) {
        var originCallSite = CallSite.create(origin);
        this.callSites.unshift(originCallSite);
    },

    toJSON: function() {
        return {
            name: this.name,
            message: this.message,
            callSites: this.callSites
        };
    },

    fetch: function() {
        // currently we only get the source of the file, but we should also get source for the sourcemapped files

        var readyPromise;
        var fileName = this.fileName;

        if (fileName) {
            var filePath;
            if (fileName.indexOf('file:///') === 0) {
                filePath = fileName.slice('file:///'.length);
            } else {
                filePath = fileName;
            }

            var fileSourcePromise;
            if (jsenv.isNode()) {
                fileSourcePromise = System.import('@node/fs').then(function(fs) {
                    return new Promise(function(res, rej) {
                        fs.exists(filePath, function(error, exists) {
                            if (error) {
                                rej(error);
                            } else {
                                res(exists);
                            }
                        });
                    }).then(function(exists) {
                        if (exists) {
                            return fs.readFileSync(filePath, 'utf8');
                        }
                    });
                });
            } else {
                // do it in browser
            }

            readyPromise = fileSourcePromise.then(function(fileSource) {
                this.fileSource = fileSource;
                return fileSource;
            }.bind(this));
        } else {
            readyPromise = Promise.resolve();
        }

        return readyPromise;
    },

    toString: function() {
        var string = '';
        var fileName = this.fileName;
        var lineNumber = this.lineNumber;
        var columnNumber = this.columnNumber;

        // Format the line from the original source code like node does

        if (fileName) {
            string += '\n';
            string += fileName;

            if (lineNumber === null) {
                string += '\n';
            } else {
                string += ':' + lineNumber;
                if (columnNumber !== null) {
                    string += ':' + columnNumber;
                }
                string += '\n';

                if (this.fileSource) {
                    var lineSource = this.fileSource.split(/(?:\r\n|\r|\n)/)[lineNumber - 1];

                    if (lineSource) {
                        string += lineSource;

                        if (columnNumber !== null) {
                            string += '\n';
                            var i = 0;
                            var j = columnNumber - 1;
                            var char;
                            for (;i < j; i++) {
                                char = lineSource[i];
                                // keep \t and space but replace others by spaces
                                string += char === ' ' || char === '\t' ? char : ' ';
                            }
                            string += '^\n';
                        }
                    }
                }
            }
        }

        string += this.stack;

        return string;
    }
};

var errorProperties = {
    get fileName() {
        return this.stackTrace.fileName;
    },

    get lineNumber() {
        return this.stackTrace.lineNumber;
    },

    get columnNumber() {
        return this.stackTrace.columnNumber;
    },

    // get stack(){
    //     return this.stackTrace.stack;
    // },

    // set stack(value){
    //     this.stackTrace.stack = value;
    // },

    unshift: function(origin) {
        this.stackTrace.unshift(origin);
    },

    toJSON: function() {
        var properties = {};

        Object.getOwnPropertyNames(this).filter(function(name) {
            return (name in errorProperties) === false && this.stackTrace.hasOwnProperty(name) === false;
        }, this).forEach(function(name) {
            properties[name] = this[name];
        }, this);

        properties.stackTrace = this.stackTrace;

        return properties;
    },

    toString: function() {
        return this.stackTrace.toString();
    }
};

function install(error, v8CallSites) {
    var stackTrace;

    if (is(error)) {
        // trigger Error.prepareStackTrace
        var stack = error.stack; // eslint-disable-line no-unused-vars

        if ('stackTrace' in error) { // install once
            stackTrace = error.stackTrace;
        } else {
            stackTrace = StackTrace.create(error, v8CallSites);
            error.stackTrace = stackTrace;

            Object.keys(errorProperties).forEach(function(key) {
                Object.defineProperty(error, key, Object.getOwnPropertyDescriptor(errorProperties, key));
            });
        }
    } else {
        stackTrace = StackTrace.create(error);
    }

    return stackTrace;
}

function prepareStackTrace(error, stack) {
    var stackTrace = install(error, stack);
    return String(stackTrace);
}

Error.prototype.toString = function() { // eslint-disable-line no-extend-native
    return install(this).toString();
};

Error.prototype.inspect = function() { // eslint-disable-line no-extend-native
    return install(this).toString();
};

var exports = {
    properties: errorProperties,

    // this is used to wrap a function saying it must be hidden from the stacktrace
    notrace: function(fn) {
        fn.notrace = true;
        // if we do not support v8 trace or if we don' thave the stackTrace we cannot remove the function from the stack
        // unless the function name states that it must be removed

        var name = fn.name + '__notrace__';
        /* eslint-disable no-multi-str */
        // eslint-disable-next-line no-new-func
        var createNamedFunction = new Function('\
            return function(fn) {\
                return function ' + name + '() {\
                    return fn.apply(this, arguments);\
                };\
            }'
        );

        return createNamedFunction(fn);
    },

    setTransformer: function(callSiteTransformer) {
        StackTrace.callSiteTransformer = callSiteTransformer;
    },

    setFilter: function(callSiteFilter) {
        StackTrace.callSiteFilter = callSiteFilter;
    },

    create: function(error) {
        return StackTrace.create(error);
    },

    install: function(error) {
        return install(error);
    }
};

jsenv.defineSupportDetector('v8-stack', function() {
    return 'captureStackTrace' in Error;
});

if (jsenv.support('v8-stack')) {
    exports.prepareStacktraceAssignment = jsenv.createCancellableAssignment(Error, 'prepareStackTrace');

    exports.enableAutoInstall = function() {
        this.prepareStacktraceAssignment.assign(prepareStackTrace);
    };

    exports.disableAutoInstall = function() {
        this.prepareStacktraceAssignment.cancel();
    };

    exports.enableAutoInstall();
}

export default exports;