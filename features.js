/* eslint-env browser, node */
/* globals jsenv */

(function() {
    var Predicate = jsenv.Predicate;
    var Iterable = jsenv.Iterable;

    function transpile(strings) {
        var result;
        var raw = strings.raw;
        var i = 0;
        var j = raw.length;
        result = raw[i];
        i++;
        while (i < j) {
            result += arguments[i];
            result += raw[i];
            i++;
        }
        return jsenv.createSourceCode(result);
    }
    function sameValues(a, b) {
        if (typeof a === 'string') {
            a = convertStringToArray(a);
        }
        if (typeof b === 'string') {
            b = convertStringToArray(b);
        }
        if (a.length !== b.length) {
            return false;
        }
        var i = a.length;
        while (i--) {
            if (a[i] !== b[i]) {
                return false;
            }
        }
        return true;
    }
    function convertStringToArray(string) {
        var result = [];
        var i = 0;
        var j = string.length;
        while (i < j) {
            var char = string[i];

            if (i < j - 1) {
                var charCode = string.charCodeAt(i);

                // fix astral plain strings
                if (charCode >= 55296 && charCode <= 56319) {
                    i++;
                    result.push(char + string[i]);
                } else {
                    result.push(char);
                }
            } else {
                result.push(char);
            }
            i++;
        }
        return result;
    }
    function createIterableObject(arr, methods) {
        var j = arr.length;
        var iterable = {};
        iterable[Symbol.iterator] = function() {
            var i = -1;
            var iterator = {
                next: function() {
                    i++;
                    return {
                        value: i === j ? undefined : arr[i],
                        done: i === j
                    };
                }
            };
            jsenv.assign(iterator, methods || {});
            iterator.iterable = iterable;

            return iterator;
        };
        return iterable;
    }
    function collectKeys(value) {
        var keys = [];
        for (var key in value) {
            if (value.hasOwnProperty(key)) {
                if (isNaN(key) === false && value instanceof Array) {
                    // key = Number(key);
                    keys.push(key);
                } else {
                    keys.push(key);
                }
            }
        }
        return keys;
    }
    function consumeIterator(iterator) {
        var values = [];
        var next = iterator.next();
        while (next.done === false) {
            values.push(next.value);
            next = iterator.next();
        }
        return values;
    }

    /*
    this is all about mapping
    https://github.com/babel/babel-preset-env/blob/master/data/plugin-features.js
    with
    https://github.com/kangax/compat-table/blob/gh-pages/data-es5.js
    https://github.com/kangax/compat-table/blob/gh-pages/data-es6.js
    */
    jsenv.registerFeatures(function(register) {
        var noValue = {novalue: true};

        function produceFromPath() {
            var feature = this;
            var result;
            var parent = feature.parent;

            if (parent) {
                var parentResult = parent.result;
                result = parentResult;

                if (feature.hasOwnProperty('path')) {
                    var path = feature.path;
                    var parts = path.split('.');
                    var i = 0;
                    var j = parts.length;
                    while (i < j) {
                        var part = parts[i];
                        if (part in result) {
                            result = result[part];
                        } else {
                            result = noValue;
                            break;
                        }
                        i++;
                    }
                }
            } else {
                result = jsenv.global;
                // throw new Error('feature without parent must have a result property');
            }
            return result;
        }
        function produceFromComposedPath() {
            var result;
            var i = 0;
            var composedFeatures = this.dependencies;
            var j = composedFeatures.length;
            while (i < j) {
                var composedFeatureValue = composedFeatures[i].result;
                if (i === 0) {
                    result = composedFeatureValue;
                } else if (composedFeatureValue in result) {
                    result = result[composedFeatureValue];
                } else {
                    result = noValue;
                    break;
                }
                i++;
            }
            return result;
        }
        function presence(value, settle) {
            if (value === noValue) {
                settle(false, 'missing');
            } else {
                settle(true, 'present');
            }
        }

        register('global', {
            code: produceFromPath,
            pass: presence
        }).ensure(function(register) {
            register('system', {
                path: 'System'
            });
            register('promise', {
                path: 'Promise'
            }).ensure(function(register) {
                register('unhandled-rejection', {
                    pass: function(Promise, settle) {
                        var promiseRejectionEvent;
                        var unhandledRejection = function(e) {
                            promiseRejectionEvent = e;
                        };

                        if (jsenv.isBrowser()) {
                            if ('onunhandledrejection' in window === false) {
                                return settle(false);
                            }
                            window.onunhandledrejection = unhandledRejection;
                        } else if (jsenv.isNode()) {
                            process.on('unhandledRejection', function(value, promise) {
                                unhandledRejection({
                                    promise: promise,
                                    reason: value
                                });
                            });
                        } else {
                            return settle(false);
                        }

                        Promise.reject('foo');
                        setTimeout(function() {
                            var valid = (
                                promiseRejectionEvent &&
                                promiseRejectionEvent.reason === 'foo'
                            );
                            // to be fully compliant we shoudl ensure
                            // promiseRejectionEvent.promise === the promise rejected above
                            // BUT it seems corejs dos not behave that way
                            // and I'm not 100% sure what is the expected promise object here
                            settle(valid);
                        }, 10); // engine has 10ms to trigger the event
                    }
                });
                register('rejection-handled', {
                    pass: function(Promise, settle) {
                        var promiseRejectionEvent;
                        var rejectionHandled = function(e) {
                            promiseRejectionEvent = e;
                        };

                        if (jsenv.isBrowser()) {
                            if ('onrejectionhandled' in window === false) {
                                return settle(false);
                            }
                            window.onrejectionhandled = rejectionHandled;
                        } else if (jsenv.isNode()) {
                            process.on('rejectionHandled', function(promise) {
                                rejectionHandled({promise: promise});
                            });
                        } else {
                            return settle(false);
                        }

                        var promise = Promise.reject('foo');
                        setTimeout(function() {
                            promise.catch(function() {});
                            setTimeout(function() {
                                settle(
                                    promiseRejectionEvent &&
                                    promiseRejectionEvent.promise === promise
                                );
                                // node event emit the value
                                // so we can't check for
                                // promiseRejectionEvent.reason === 'foo'
                            }, 10); // engine has 10ms to trigger the event
                        });
                    }
                });
            });
            register('symbol', {
                path: 'Symbol'
            }).ensure(function(register) {
                register('iterator', {
                    path: 'iterator'
                });
                register('to-primitive', {
                    path: 'toPrimitive'
                });
            });
            register('object', {
                path: 'Object'
            }).ensure(function(register) {
                register('get-own-property-descriptor', {
                    path: 'getOwnPropertyDescriptor'
                });
                register('assign', {
                    path: 'assign'
                });
            });
            register('date', {
                path: 'Date'
            }).ensure(function(register) {
                register('now', {
                    path: 'now'
                });
                register('prototype', {
                    path: 'prototype'
                }).ensure(function(register) {
                    register('symbol-to-primitive', {
                        dependencies: ['symbol-to-primitive'],
                        code: produceFromComposedPath
                    });
                    register('to-json', {
                        path: 'toJSON'
                    }).ensure(function(register) {
                        // https://github.com/zloirock/core-js/blob/v2.4.1/modules/es6.date.to-json.js
                        register('nan-return-null', {
                            pass: function() {
                                return new Date(NaN).toJSON() === null;
                            }
                        });
                        register('use-to-iso-string', {
                            pass: function() {
                                var fakeDate = {
                                    toISOString: function() {
                                        return 1;
                                    }
                                };
                                return Date.prototype.toJSON.call(fakeDate) === 1;
                            }
                        });
                    });
                    register('to-iso-string', {
                        path: 'toISOString'
                    }).ensure(function(register) {
                        // https://github.com/zloirock/core-js/blob/v2.4.1/modules/es6.date.to-iso-string.js
                        register('negative-5e13', {
                            pass: function() {
                                return new Date(-5e13 - 1).toISOString() === '0385-07-25T07:06:39.999Z';
                            }
                        });
                        register('nan-throw', {
                            pass: Predicate.fails(function() {
                                new Date(NaN).toISOString(); // eslint-disable-line no-unused-expressions
                            })
                        });
                    });
                    register('to-string', {
                        path: 'toString'
                    }).ensure(function(register) {
                        register('nan-return-invalid-date', {
                            pass: function() {
                                // https://github.com/zloirock/core-js/blob/v2.4.1/modules/es6.date.to-string.js
                                return new Date(NaN).toString() === 'Invalid Date';
                            }
                        });
                    });
                });
            });
            register('array', {
                path: 'Array'
            }).ensure(function(register) {
                register('from', {
                    path: 'from'
                });
                register('prototype', {
                    path: 'prototype'
                }).ensure(function(register) {
                    register('symbol-iterator', {
                        dependencies: ['symbol-iterator'],
                        code: produceFromComposedPath
                    }).ensure(function(register) {
                        register('sparse', {
                            pass: function(arrayIterator) {
                                var sparseArray = [,,]; // eslint-disable-line no-sparse-arrays, comma-spacing
                                var iterator = arrayIterator.call(sparseArray);
                                var values = consumeIterator(iterator);

                                return sameValues(values, sparseArray);
                            }
                        });
                    });
                });
            });
            register('function', {
                path: 'Function'
            }).ensure(function(register) {
                register('prototype', {
                    path: 'prototype'
                }).ensure(function(register) {
                    register('name', {
                        path: 'name'
                    }).ensure(function(register) {
                        register('description', {
                            pass: function() {
                                var descriptor = Object.getOwnPropertyDescriptor(
                                    function f() {},
                                    'name'
                                );

                                return (
                                    descriptor.enumerable === false &&
                                    descriptor.writable === false &&
                                    descriptor.configurable === true
                                );
                            }
                        });
                        register('statement', {
                            pass: function() {
                                function foo() {}

                                return (
                                    foo.name === 'foo' &&
                                    (function() {}).name === ''
                                );
                            }
                        });
                        register('expression', {
                            pass: function() {
                                return (
                                    (function foo() {}).name === 'foo' &&
                                    (function() {}).name === ''
                                );
                            }
                        });
                        register('new', {
                            code: transpile`(function() {
                                return new Function();
                            })`,
                            pass: function(fn) {
                                return fn().name === 'anonymous';
                            }
                        });
                        register('bind', {
                            code: transpile`(function() {
                                function foo() {}
                                var boundFoo = foo.bind({});
                                var boundAnonymous = (function() {}).bind({});
                                return [boundFoo, boundAnonymous];
                            })`,
                            pass: function(fn) {
                                var result = fn();
                                return (
                                    result[0].name === "bound foo" &&
                                    result[1].name === "bound "
                                );
                            }
                        });
                        register('var', {
                            code: transpile`(function() {
                                var a = function() {};
                                var b = function c() {};
                                return [a, b];
                            })`,
                            pass: function(fn) {
                                var result = fn();
                                return (
                                    result[0].name === 'a' &&
                                    result[1].name === 'c'
                                );
                            }
                        });
                        register('accessor', {
                            code: transpile`(function() {
                                return {
                                    get foo() {},
                                    set foo(x) {}
                                };
                            })`,
                            pass: function(fn) {
                                var result = fn();
                                var descriptor = Object.getOwnPropertyDescriptor(result, 'foo');

                                return (
                                    descriptor.get.name === 'get foo' &&
                                    descriptor.set.name === 'set foo'
                                );
                            }
                        });
                        register('method', {
                            code: transpile`function() {
                                var result = {
                                    a: function() {},
                                    b: function c() {};
                                };
                                result.d = function() {};
                                return result;
                            })`,
                            pass: function(fn) {
                                var result = fn();
                                return (
                                    result.a.name === 'a' &&
                                    result.b.name === 'c' &&
                                    result.d.name === ''
                                );
                            }
                        });
                        register('method-shorthand', {
                            dependencies: [
                                'shorthand-methods'
                            ],
                            code: transpile`(function() {
                                return {
                                    foo() {}
                                };
                            })`,
                            pass: function(fn) {
                                return fn().foo.name === 'foo';
                            }
                        });
                        register('method-shorthand-lexical-binding', {
                            code: transpile`(function(value) {
                                var f = value;
                                return ({
                                    f() {
                                        return f;
                                    }
                                });
                            })`,
                            pass: function(fn) {
                                var value = 1;
                                return fn(value).f() === value;
                            }
                        });
                        register('method-computed-symbol', {
                            dependencies: [
                                'symbol',
                                'computed-properties'
                            ],
                            code: transpile`(function() {
                                var first = Symbol('foo');
                                var second = Symbol();
                                return {
                                    first: first,
                                    second: second,
                                    [first]: function() {},
                                    [second]: function() {}
                                };
                            })`,
                            pass: function(fn) {
                                var result = fn();

                                return (
                                    result[result.first].name === '[foo]' &&
                                    result[result.second].name === ''
                                );
                            }
                        });
                    });
                });
            });
            register('string', {
                path: 'String'
            }).ensure(function(register) {
                register('prototype', {
                    path: 'prototype'
                }).ensure(function(register) {
                    register('symbol-iterator', {
                        dependencies: ['symbol-iterator'],
                        code: produceFromComposedPath
                    }).ensure(function(register) {
                        register('basic', {
                            pass: function(stringIterator) {
                                var string = '1234';
                                var iterator = stringIterator.call(string);
                                var values = consumeIterator(iterator);

                                return sameValues(values, string);
                            }
                        });
                        register('astral', {
                            pass: function(stringIterator) {
                                var astralString = '𠮷𠮶';
                                var iterator = stringIterator.call(astralString);
                                var values = consumeIterator(iterator);

                                return sameValues(values, astralString);
                            }
                        });
                    });
                });
            });
            register('url', {
                path: 'URL'
            });
            register('url-search-params', {
                path: 'URLSearchParams'
            });
        });

        /*
        if (jsenv.isBrowser() === false) {
            implementation.exclude('node-list');
            // etc
            // en gros on exclu certains features quand on est pas dans le browser
        }
        */

        register('for-of', {
            dependencies: [
                'array-prototype-symbol-iterator'
            ],
            code: transpile`(function(value) {
                var result = [];
                for (var entry of value) {
                    result.push(entry);
                }
                return result;
            })`,
            pass: function(result) {
                var value = [5];
                return sameValues(result(value), value);
            }
        }).ensure(function(register) {
            register('iterable', {
                dependencies: [
                    'symbol-iterator'
                ],
                pass: function(result) {
                    var data = [1, 2, 3];
                    var iterable = createIterableObject(data);
                    return sameValues(result(iterable), data);
                }
            });
            register('iterable-instance', {
                pass: function(result) {
                    var data = [1, 2, 3];
                    var iterable = createIterableObject(data);
                    var instance = Object.create(iterable);

                    return sameValues(result(instance), data);
                }
            });
            register('iterable-return-called-on-break', {
                code: transpile`(function(value) {
                    for (var it of value) {
                        break;
                    }
                })`,
                pass: function(fn) {
                    var called = false;
                    var iterable = createIterableObject([1], {
                        'return': function() {
                            called = true;
                            return {};
                        }
                    });
                    fn(iterable);
                    return called;
                }
            });
            register('iterable-return-called-on-throw', {
                code: transpile`(function(value, throwedValue) {
                    for (var it of value) {
                        throw throwedValue;
                    }
                })`,
                pass: function(fn) {
                    var called = false;
                    var iterable = createIterableObject([1], {
                        'return': function() { // eslint-disable-line
                            called = true;
                            return {};
                        }
                    });
                    var throwedValue = 0;

                    try {
                        fn(iterable, throwedValue);
                    } catch (e) {
                        return (
                            e === throwedValue &&
                            called
                        );
                    }
                    return false;
                }
            });
        });

        register('const', {
            code: transpile`(function(value) {
                const result = value;
                return result;
            })`,
            pass: function(fn) {
                var value = 1;
                return fn(value) === value;
            }
        }).ensure(function(register) {
            register('throw-statement', {
                code: transpile`(function() {
                    if (true) const bar = 1;
                })`,
                fail: function(error) {
                    return error.name === 'SyntaxError';
                }
            });
            register('throw-redefine', {
                code: transpile`(function() {
                    const foo = 1;
                    foo = 2;
                })`,
                pass: Predicate.fails(function(fn) {
                    fn();
                })
            });
            register('temporal-dead-zone', {
                code: transpile`(function(value) {
                    var result;
                    function fn() {
                        result = foo;
                    }
                    const foo = value;
                    fn();
                    return result;
                })`,
                pass: function(fn) {
                    var value = 10;
                    return fn(value) === value;
                }
            });
            register('scoped', {
                code: transpile`(function(outsideValue, insideValue) {
                    const result = outsideValue;
                    {
                        const result = insideValue;
                    }
                    return result;
                })`,
                pass: function(fn) {
                    var outsideValue = 0;
                    var insideValue = 1;
                    return fn(outsideValue, insideValue) === outsideValue;
                }
            });
            register('scoped-for-statement', {
                code: transpile`(function(outsideValue, insideValue) {
                    const foo = outsideValue;
                    for(const foo = insideValue; false;) {}
                    return foo;
                })`,
                pass: function(fn) {
                    var outsideValue = 0;
                    var insideValue = 1;
                    return fn(outsideValue, insideValue) === outsideValue;
                }
            });
            register('scoped-for-body', {
                code: transpile`(function(value) {
                    var scopes = [];
                    for(const i in value) {
                        scopes.push(function() {
                            return i;
                        });
                    }
                    return scopes;
                })`,
                pass: function(fn) {
                    var value = [0, 1];
                    var scopes = fn(value);
                    var scopeValues = Iterable.map(scopes, function(scope) {
                        return scope();
                    });
                    return sameValues(scopeValues, collectKeys(value));
                }
            });
            register('scoped-for-of-body', {
                dependencies: ['for-of'],
                code: transpile`(function(value) {
                    var scopes = [];
                    for(const i of value) {
                        scopes.push(function() {
                            return i;
                        });
                    }
                    return scopes;
                })`,
                pass: function(fn) {
                    var value = ['a', 'b'];
                    var scopes = fn(value);
                    var scopeValues = Iterable.map(scopes, function(scope) {
                        return scope();
                    });
                    return sameValues(scopeValues, value);
                }
            });
        });

        register('let', {
            code: transpile`(function(value) {
                let result = value;
                return result;
            })`,
            pass: function(fn) {
                var value = 123;
                return fn(value) === value;
            }
        }).ensure(function(register) {
            register('throw-statement', {
                code: transpile`(function() {
                    if (true) let result = 1;
                })`,
                fail: function(error) {
                    return error.name === 'SyntaxError';
                }
            });
            register('temporal-dead-zone', {
                code: transpile`(function(value) {
                    var result;
                    function fn() {
                        result = foo;
                    }
                    let foo = value;
                    fn();
                    return result;
                })`,
                pass: function(fn) {
                    var value = 10;
                    return fn(value) === value;
                }
            });
            register('scoped', {
                code: transpile`(function(outsideValue, insideValue) {
                    let result = outsideValue;
                    {
                        let result = insideValue;
                    }
                    return result;
                })`,
                pass: function(fn) {
                    var outsideValue = 0;
                    var insideValue = 1;
                    return fn(outsideValue, insideValue) === outsideValue;
                }
            });
            register('scoped-for-statement', {
                code: transpile`(function(outsideValue, insideValue) {
                    let result = outsideValue;
                    for(let result = insideValue; false;) {}
                    return result;
                })`,
                pass: function(fn) {
                    var outsideValue = 0;
                    var insideValue = 1;
                    return fn(outsideValue, insideValue) === outsideValue;
                }
            });
            register('scoped-for-body', {
                code: transpile`(function(iterable) {
                    var scopes = [];
                    for(let i in iterable) {
                        scopes.push(function() {
                            return i;
                        });
                    }
                    return scopes;
                })`,
                pass: function(fn) {
                    var iterable = [0, 1];
                    var scopes = fn(iterable);
                    var scopeValues = Iterable.map(scopes, function(scope) {
                        return scope();
                    });
                    return sameValues(scopeValues, collectKeys(iterable));
                }
            });
        });

        register('computed-properties', {
            code: transpile`(function(name, value) {
                return {[name]: value};
            })`,
            pass: function(fn) {
                var name = 'y';
                var value = 1;
                return fn(name, value)[name] === value;
            }
        });

        register('shorthand-properties', {
            code: transpile`(function(a, b) {
                return {a, b};
            })`,
            pass: function(fn) {
                var a = 1;
                var b = 2;
                var result = fn(a, b);

                return (
                    result.a === a &&
                    result.b === b
                );
            }
        });

        register('shorthand-methods', {
            code: transpile`(function() {
                return {
                    y() {}
                };
            })`,
            pass: function(fn) {
                var result = fn();
                return typeof result.y === 'function';
            }
        });

        register('destructuring-declaration-array', {
            code: transpile`(function(value) {
                var [a] = value;
                return a;
            })`,
            pass: function(fn) {
                var value = 1;
                return fn([value]) === value;
            }
        }).ensure(function(register) {
            register('trailing-commas', {
                code: transpile`(function(value) {
                    var [a,] = value;
                    return a;
                })`,
                pass: function(fn) {
                    var value = 0;
                    return fn([value]) === value;
                }
            });
            register('iterable', {
                code: transpile`(function(value) {
                    var [a, b, c] = value;
                    return [a, b, c];
                })`,
                pass: function(fn) {
                    var data = [1, 2];
                    var iterable = createIterableObject(data);

                    return sameValues(fn(iterable), [1, 2, undefined]);
                }
            }).ensure(function(register) {
                register('instance', {
                    pass: function(fn) {
                        var data = [1, 2];
                        var iterable = createIterableObject(data);
                        var instance = Object.create(iterable);

                        return sameValues(fn(instance), [1, 2, undefined]);
                    }
                });
            });
            register('sparse', {
                code: transpile`(function(value) {
                    var [a, ,b] = value;
                    return [a, b];
                })`,
                pass: function(fn) {
                    var firstValue = 1;
                    var lastValue = 3;
                    var result = fn([firstValue, null, lastValue]);
                    return sameValues(result, [firstValue, lastValue]);
                }
            });
            register('nested', {
                code: transpile`(function(value) {
                    var [[a]] = value;
                    return a;
                })`,
                pass: function(fn) {
                    var value = 1;
                    return fn([[value]]) === value;
                }
            });
            register('for-in-statement', {
                code: transpile`(function(value) {
                    for (var [a, b] in value);
                    return [a, b];
                })`,
                pass: function(fn) {
                    var value = {fo: 1};
                    return sameValues(fn(value), ['f', 'o']);
                }
            });
            register('for-of-statement', {
                dependencies: ['for-of'],
                code: transpile`(function(iterable) {
                    for(var [a, b] of iterable);
                    return [a, b];
                })`,
                pass: function(fn) {
                    var data = [0, 1];
                    return sameValues(fn([data]), data);
                }
            });
            register('catch-statement', {
                code: transpile`(function(value) {
                    try {
                        throw value;
                    } catch ([a]) {
                        return a;
                    }
                })`,
                pass: function(fn) {
                    var value = 1;
                    return fn([value]) === value;
                }
            });
            register('rest', {
                code: transpile`(function(value) {
                    var [a, ...b] = value;
                    return [a, b];
                })`,
                pass: function(fn) {
                    var firstValue = 1;
                    var lastValue = 2;
                    var firstResult = fn([firstValue, lastValue]);
                    var secondResult = fn([firstValue]);

                    return (
                        firstResult[0] === firstValue &&
                        sameValues(firstResult[1], [lastValue]) &&
                        secondResult[0] === firstValue &&
                        sameValues(secondResult[1], [])
                    );
                }
            });
            register('default', {
                code: transpile`(function(defaultValues, values) {
                    var [a = defaultValues[0], b = defaultValues[1], c = defaultValues[2]] = values;
                    return [a, b, c];
                })`,
                pass: function(fn) {
                    var defaultA = 1;
                    var defaultB = 2;
                    var defaultC = 3;
                    var a = 4;
                    var result = fn(
                        [
                            defaultA,
                            defaultB,
                            defaultC
                        ],
                        [ // eslint-disable-line no-sparse-arrays
                            a,
                            , // eslint-disable-line comma-style
                            undefined
                        ]
                    );

                    return sameValues(result, [a, defaultB, defaultC]);
                }
            });
        });
        register('destructuring-declaration-object', {
            code: transpile`(function(value) {
                var {a} = value;
                return a;
            })`,
            pass: function(fn) {
                var value = 1;
                return fn({a: value}) === value;
            }
        }).ensure(function(register) {
            register('throw-null', {
                pass: Predicate.fails(function(fn) {
                    fn(null);
                }, {name: 'TypeError'})
            });
            register('throw-undefined', {
                pass: Predicate.fails(function(fn) {
                    fn(undefined);
                }, {name: 'TypeError'})
            });
            register('primitive-return-prototype', {
                pass: function(fn) {
                    var value = 2;
                    // the expected behaviour is
                    // var {a} = 2;
                    // leads to a = 2.constructor.prototype.a;
                    var prototypeValue = 'foo';
                    var primitivePrototype = value.constructor.prototype;
                    primitivePrototype.a = prototypeValue;
                    var result = fn(value);
                    delete primitivePrototype.a;

                    return result === prototypeValue;
                }
            });
            register('trailing-commas', {
                code: transpile`(function(value) {
                    var {a,} = value;
                    return a;
                })`,
                pass: function(fn) {
                    var value = 1;
                    return fn({a: value}) === value;
                }
            });
            register('double-dot-as', {
                code: transpile`(function(value) {
                    var {x:a} = value;
                    return a;
                })`,
                pass: function(fn) {
                    var value = 1;
                    return fn({x: value}) === value;
                }
            });
            register('computed-properties', {
                dependencies: ['computed-properties'],
                code: transpile`(function(name, value) {
                    var {[name]: a} = value;
                    return a;
                })`,
                pass: function(fn) {
                    var name = 'a';
                    var value = 1;
                    var object = {};
                    object[name] = value;
                    return fn(name, object) === value;
                }
            });
            register('catch-statement', {
                code: transpile`(function(value) {
                    try {
                        throw value;
                    } catch ({a}) {
                        return a;
                    }
                })`,
                pass: function(fn) {
                    var value = 1;
                    return fn({a: value}) === value;
                }
            });
            register('default', {
                code: transpile`(function(defaultValues, value) {
                    var {a = defaultValues.a, b = defaultValues.b, c = defaultValues.c} = value;
                    return [a, b, c];
                })`,
                pass: function(fn) {
                    var defaultA = 1;
                    var defaultB = 2;
                    var defaultC = 3;
                    var a = 0;
                    var result = fn(
                        {
                            a: defaultA,
                            b: defaultB,
                            c: defaultC
                        },
                        {
                            a: a,
                            c: undefined
                        }
                    );
                    return sameValues(result, [a, defaultB, defaultC]);
                }
            });
            register('default-let-temporal-dead-zone', {
                dependencies: ['let'],
                code: transpile`(function() {
                    let {c = c} = {};
                    let {c = d, d} = {d: 1};
                })`,
                fail: function(error) {
                    return error instanceof Error;
                }
            });
        });
        register('destructuring-declaration-array-chain-object', {
            dependencies: [
                'destructuring-declaration-array',
                'destructuring-declaration-object'
            ],
            code: transpile`(function(array, object) {
                var [a] = array, {b} = object;
                return [a, b];
            })`,
            pass: function(fn) {
                var value = 1;
                return sameValues(fn([value], {b: value}), [value, value]);
            }
        });
        register('destructuring-declaration-array-nest-object', {
            dependencies: [
                'destructuring-declaration-array',
                'destructuring-declaration-object'
            ],
            code: transpile`(function(value) {
                var [{a}] = value;
                return a;
            })`,
            pass: function(fn) {
                var value = 1;
                return fn([{a: value}]) === value;
            }
        });
        register('destructuring-declaration-object-nest-array', {
            dependencies: [
                'destructuring-declaration-array',
                'destructuring-declaration-object',
                'destructuring-declaration-object-double-dot-as'
            ],
            code: transpile`(function(value) {
                var {a:[a]} = value;
                return a;
            })`,
            pass: function(fn) {
                var value = 1;
                return fn({a: [value]}) === value;
            }
        });
        register('destructuring-assignment-array', {
            code: transpile`(function(a, b) {
                [b, a] = [a, b];
                return [a, b];
            })`,
            pass: function(fn) {
                var a = 1;
                var b = 2;
                return sameValues(fn(a, b), [b, a]);
            }
        }).ensure(function(register) {
            register('empty', {
                code: transpile`(function() {
                    [] = [1,2];
                })`,
                pass: function(fn) {
                    fn();
                    return true;
                }
            });
            register('rest-nest', {
                code: transpile`(function(first, middle, last) {
                    var value = [first, middle, last];
                    var head;
                    var tail;
                    [head, ...[value[2], tail]] = value;
                    return [value, head, tail];
                })`,
                pass: function(fn) {
                    var first = 1;
                    var middle = 2;
                    var last = 3;
                    var result = fn(first, middle, last);

                    return (
                        sameValues(result[0], [first, middle, middle]) &&
                        result[1] === first &&
                        result[2] === last
                    );
                }
            });
            register('expression-return', {
                code: transpile`(function(value) {
                    var a;
                    return ([a] = value);
                })`,
                pass: function(fn) {
                    var value = [];
                    return fn(value) === value;
                }
            });
            register('chain', {
                code: transpile`(function(value) {
                    var a, b;
                    ([a] = [b] = [value]);
                    return [a, b];
                })`,
                pass: function(fn) {
                    var value = 1;
                    return sameValues(fn(value), [value, value]);
                }
            });
        });
        register('destructuring-assignment-object', {
            code: transpile`(function(value) {
                ({a} = {a: value});
                return a;
            })`,
            pass: function(fn) {
                var value = 1;
                return fn(value) === value;
            }
        }).ensure(function(register) {
            register('empty', {
                code: transpile`(function() {
                    ({} = {a:1, b:2});
                })`,
                pass: function(fn) {
                    fn();
                    return true;
                }
            });
            register('expression-return', {
                code: transpile`(function(value) {
                    var a;
                    return ({a} = value);
                })`,
                pass: function(fn) {
                    var value = {};
                    return fn(value) === value;
                }
            });
            register('throw-left-parenthesis', {
                code: transpile`(function(value) {
                    var a;
                    ({a}) = value;
                })`,
                fail: function(error) {
                    return error instanceof SyntaxError;
                }
            });
            register('chain', {
                code: transpile`(function(value) {
                    var a, b;
                    ({a} = {b} = {a: value, b: value});
                    return [a, b];
                })`,
                pass: function(fn) {
                    var value = 1;
                    return sameValues(fn(value), [value, value]);
                }
            });
        });
        register('destructuring-parameters-array', {
            code: transpile`(function([a]) {
                return a;
            })`,
            pass: function(fn) {
                var value = 1;
                return fn([value]) === value;
            }
        }).ensure(function(register) {
            register('function-length', {
                pass: function(fn) {
                    return fn.length === 1;
                }
            });
            register('new-function', {
                code: function() {
                    return new Function( // eslint-disable-line no-new-func
                        '[a]',
                        'return a;'
                    );
                },
                pass: function(fn) {
                    var value = 1;
                    return fn([value]) === value;
                }
            });
        });
        register('destructuring-parameters-object', {
            code: transpile`(function({a}) {
                return a;
            })`,
            pass: function(fn) {
                var value = 1;
                return fn({a: value}) === value;
            }
        }).ensure(function(register) {
            register('new-function', {
                code: function() {
                    return new Function( // eslint-disable-line no-new-func
                        '{a}',
                        'return a;'
                    );
                },
                pass: function(fn) {
                    var value = 1;
                    return fn({a: value}) === value;
                }
            });
            register('function-length', {
                code: transpile`(function({a}) {})`,
                pass: function(fn) {
                    return fn.length === 1;
                }
            });
        });

        register('spread-function-call', {
            code: transpile`(function(method, args) {
                return method(...args);
            })`,
            pass: function(fn) {
                var method = Math.max;
                var args = [1, 2, 3];

                return fn(method, args) === method.apply(null, args);
            }
        }).ensure(function(register) {
            register('throw-non-iterable', {
                pass: Predicate.fails(function(fn) {
                    fn(Math.max, true);
                })
            });
            register('iterable', {
                dependencies: [
                    'symbol-iterator'
                ],
                pass: function(fn) {
                    var method = Math.max;
                    var data = [1, 2, 3];
                    var iterable = createIterableObject(data);

                    return fn(method, iterable) === method.apply(null, data);
                }
            });
            register('iterable-instance', {
                pass: function(fn) {
                    var method = Math.max;
                    var data = [1, 2, 3];
                    var iterable = createIterableObject(data);
                    var instance = Object.create(iterable);

                    return fn(method, instance) === method.apply(null, data);
                }
            });
        });
        register('spread-literal-array', {
            code: transpile`(function(value) {
                return [...value];
            })`,
            pass: function(fn) {
                var value = [1, 2, 3];
                return sameValues(fn(value), value);
            }
        }).ensure(function(register) {
            register('iterable', {
                dependencies: [
                    'symbol-iterator'
                ],
                pass: function(fn) {
                    var data = [1, 2, 3];
                    var iterable = createIterableObject(data);
                    return sameValues(fn(iterable), data);
                }
            });
            register('iterable-instance', {
                pass: function(fn) {
                    var data = [1, 2, 3];
                    var iterable = createIterableObject(data);
                    var instance = Object.create(iterable);
                    return sameValues(fn(instance), data);
                }
            });
        });

        register('function-default-parameters', {
            code: transpile`(function(defaultA, defaultB) {
                return function(a = defaultA, b = defaultB) {
                    return [a, b];
                };
            })`,
            pass: function(fn) {
                var defaultA = 1;
                var defaultB = 2;
                var a = 3;
                var result = fn(defaultA, defaultB)(a);
                return sameValues(result, [a, defaultB]);
            }
        }).ensure(function(register) {
            register('explicit-undefined', {
                pass: function(fn) {
                    var defaultA = 1;
                    var defaultB = 2;
                    var a;
                    var b = 4;
                    var result = fn(defaultA, defaultB)(a, b);
                    return sameValues(result, [defaultA, b]);
                }
            });
            register('refer-previous', {
                code: transpile`(function(defaultValue) {
                    return function(a = defaultValue, b = a) {
                        return [a, b];
                    };
                })`,
                pass: function(fn) {
                    var defaultValue = 1;
                    var result = fn(defaultValue)();
                    return sameValues(result, [defaultValue, defaultValue]);
                }
            });
            register('arguments', {
                code: transpile`(function(defaultValue) {
                    return function(a = defaultValue) {
                        a = 10;
                        return arguments;
                    };
                })`,
                pass: function(fn) {
                    var defaultValue = 1;
                    var value = 2;
                    var result = fn(defaultValue)(value);
                    return sameValues(result, [value]);
                }
            });
            register('temporal-dead-zone', {
                code: transpile`(function() {
                    (function(a = a) {}());
                    (function(a = b, b){}());
                })`,
                pass: Predicate.fails(function(fn) {
                    fn();
                })
            });
            register('scope-own', {
                code: transpile`(function(a = function() {
                    return typeof b;
                }) {
                    var b = 1;
                    return a();
                })`,
                pass: function(fn) {
                    return fn() === 'undefined';
                }
            });
            register('new-function', {
                code: function() {
                    return function(defaultA, defaultB) {
                        return new Function( // eslint-disable-line no-new-func
                            "a = " + defaultA, "b = " + defaultB,
                            "return [a, b];"
                        );
                    };
                },
                pass: function(fn) {
                    var defaultA = 1;
                    var defaultB = 2;
                    var a = 3;
                    return sameValues(fn(defaultA, defaultB)(a), [a, defaultB]);
                }
            });
        });

        register('function-rest-parameters', {
            code: transpile`(function(foo, ...rest) {
                return [foo, rest];
            })`,
            pass: function(fn) {
                var first = 1;
                var second = 2;
                var result = fn(first, second);
                return (
                    result[0] === first &&
                    sameValues(result[1], [second])
                );
            }
        }).ensure(function(register) {
            register('throw-setter', {
                code: transpile`(function() {
                    return {
                        set e(...args) {}
                    };
                })`,
                fail: function(error) {
                    return error instanceof Error;
                }
            });
            register('length', {
                code: transpile`(function() {
                    return [
                        function(a, ...b) {},
                        function(...c) {}
                    ];
                })`,
                pass: function(fn) {
                    var result = fn();

                    return (
                        result[0].length === 1 &&
                        result[1].length === 0
                    );
                }
            });
            register('arguments', {
                code: transpile`(function(foo, ...rest) {
                    foo = 10;
                    return arguments;
                })`,
                pass: function(fn) {
                    var first = 1;
                    var second = 2;
                    var result = fn(first, second);
                    return sameValues(result, [first, second]);
                }
            });
            register('new-function', {
                code: function() {
                    return new Function( // eslint-disable-line no-new-func
                        "a", "...rest",
                        "return [a, rest]"
                    );
                },
                pass: function(fn) {
                    var first = 1;
                    var second = 2;
                    var result = fn(first, second);
                    return (
                        result[0] === first &&
                        sameValues(result[1], [second])
                    );
                }
            });
        });

        // register('spread-function-call-generator', {
        //     // dependencies: ['yield'],
        //     args: '\
        //         return {\
        //             value: (function*() {\
        //                 yield 1;\
        //                 yield 2;\
        //                 yield 3;\
        //             }())\
        //         };\
        //     ',
        //     pass: function(result) {
        //         return result === 3;
        //     }
        // });
        // register('spread-literal-array-generator', {
        //     args: '\
        //         return {\
        //             value: (function*() {\
        //                 yield 1;\
        //                 yield 2;\
        //                 yield 3;\
        //             }())\
        //         };\
        //     ',
        //     pass: function(result) {
        //         return sameValues(result, [1, 2, 3]);
        //     }
        // });
        // register('for-of-generator', {
        //     // dependencies: ['yield'],
        //     body: '\
        //         var result = "";\
        //         var iterable = (function*() {\
        //             yield 1;\
        //             yield 2;\
        //             yield 3;\
        //         }());\
        //         for (var item of iterable) {\
        //             result += item;\
        //         }\
        //         return result;\
        //     ',
        //     pass: function(result) {
        //         return result === '123';
        //     }
        // });
        // register('destructuring-assignement-generator')
        // https://github.com/kangax/compat-table/blob/gh-pages/data-es6.js#L10247
    });
})();