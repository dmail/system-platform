const Thenable = jsenv.Thenable;
const Output = jsenv.Output;

const pass = Output.pass;
export {pass};

const fail = Output.fail;
export {fail};

const defaultMaxTestDuration = 100;
function expect(testMap) {
    const tests = Object.keys(testMap).map(function(testName) {
        return {
            name: testName,
            test: testMap[testName]
        };
    });

    return function() {
        const compositeDetail = {};
        let i = 0;
        const j = tests.length;
        let transmittedValue;
        let currentTest;

        function transmit(value) {
            transmittedValue = value;
        }
        function next() {
            if (i === j) {
                return pass('all-passed');
            }
            currentTest = tests[i];
            i++;

            let testThenable;
            try {
                const testReturnValue = currentTest.test(transmittedValue, transmit);
                testThenable = Thenable.resolve(testReturnValue).then(function(value) {
                    if (value === true) {
                        return pass('returned-true');
                    }
                    if (value === false) {
                        return fail('returned-false');
                    }
                    if (Output.is(value)) {
                        return value;
                    }
                    return pass('resolved', value);
                });
            } catch (e) {
                testThenable = Thenable.reject(e).catch(function(value) {
                    return fail('rejected', value);
                });
            }

            let maxDuration = defaultMaxTestDuration;
            let timeout;
            return Thenable.race([
                testThenable,
                new Thenable(function(resolve) {
                    timeout = setTimeout(function() {
                        resolve(fail('timeout', maxDuration));
                    }, maxDuration);
                })
            ]).then(function(output) {
                // testThenable cannot reject, so it's ok to clearTimeout only in the onResolve branch
                clearTimeout(timeout);
                timeout = null;

                compositeDetail[currentTest.name] = output;
                if (output.status === 'failed') {
                    return fail('expectation failed: ' + currentTest.name, compositeDetail);
                }
                return next();
            });
        }

        return next();
    };
}
export {expect};

// function pipeAsync(thenable, iterable) {
//     var i = 0;
//     var j = iterable.length;
//     var currentThenable = thenable;
//     var Output = jsenv.Output;
//     var pass = Output.pass;
//     var fail = Output.fail;

//     function transform(value) {
//         currentThenable = Promise.resolve(value);
//     }
//     function next(value) {
//         if (i === j) {
//             return value;
//         }
//         if (i > 0 && value && value.status === 'failed') {
//             return value;
//         }
//         var fn = iterable[i];
//         i++;
//         return fn(currentThenable, pass, fail, transform).then(next);
//     }
//     return new Promise(function(resolve) {
//         resolve(next());
//     });
// }

const Target = (function() {
    function Target(executor) {
        var target = this;
        function pass(value) {
            target.reached = true;
            target.value = value;
        }
        function fail(value) {
            target.reached = false;
            target.value = value;
        }
        executor(
            pass,
            fail
        );
        return target;
    }
    Target.prototype = {
        constructor: Target,
        reached: false,
        accessor: null,
        chain: function(accessor) {
            var next;
            var accessorReturnValue = accessor(this);
            if (isTarget(accessorReturnValue)) {
                next = accessorReturnValue;
            } else {
                next = createPassedTarget(accessorReturnValue);
            }
            next.accessor = accessor;
            next.previous = this;
            return next;
        }
    };

    function createPassedTarget(value) {
        var target = new Target(function(pass) {
            pass(value);
        });
        return target;
    }
    function createFailedTarget(value) {
        var target = new Target(function(pass, fail) {
            fail(value);
        });
        return target;
    }
    function isTarget(a) {
        return a instanceof Target;
    }

    return {
        pass: createPassedTarget,
        fail: createFailedTarget,
        is: isTarget
    };
})();
function createPropertyAccessor(property) {
    function propertyAccessor(previous) {
        if (previous.reached) {
            var value = previous.value;
            if (property in value) {
                return value[property];
            }
        }
        return Target.fail(property);
    }
    propertyAccessor.property = property;
    return propertyAccessor;
}
function createPropertyGetterAccessor(getter) {
    function propertyGetterAccessor(previous) {
        if (previous.reached) {
            var value = previous.value;
            var getterReturnValue = getter();
            var propertyTarget;
            if (Target.is(getterReturnValue)) {
                propertyTarget = getterReturnValue;
            } else {
                propertyTarget = Target.pass(getterReturnValue);
            }
            if (propertyTarget.reached) {
                var property = propertyTarget.value;
                if (property in value) {
                    return value[property];
                }
                return Target.fail(property);
            }
            return Target.fail();
        }
        return Target.fail();
    }
    return propertyGetterAccessor;
}
function at() {
    var i = 0;
    var j = arguments.length;
    var accessors = [];

    if (j > 0) {
        var firstArg = arguments[0];
        if (typeof firstArg === 'string') {
            accessors.push(function globalAccessor() {
                return Target.pass(jsenv.global);
            });
        }

        while (i < j) {
            var arg = arguments[i];
            if (typeof arg === 'function') {
                accessors.push(createPropertyGetterAccessor(arg));
            } else if (typeof arg === 'string') {
                accessors.push(createPropertyAccessor(arg));
            }
            i++;
        }
    }

    return function() {
        var i = 0;
        var j = accessors.length;
        var finalTarget = Target.fail();

        while (i < j) {
            var accessor = accessors[i];
            finalTarget = finalTarget.chain(accessor);
            i++;
        }

        return finalTarget;
    };
}
export {at};

function presence() {
    const read = at.apply(null, arguments);
    return function(_, transmit) {
        const target = read();
        if (target.reached) {
            transmit(target.value);
            return true;
        }
        return false;
    };
}
export {presence};

const SourceCode = (function() {
    function SourceCode(source) {
        // https://github.com/dmnd/dedent/blob/master/dedent.js
        var lines = source.split('\n');
        var lowestIndent = null;
        var i = 0;
        var j = lines.length;
        while (i < j) {
            var line = lines[i];
            var match = line.match(/^(\s+)\S+/);
            if (match) {
                var indent = match[1].length;
                if (lowestIndent) {
                    lowestIndent = Math.min(lowestIndent, indent);
                } else {
                    lowestIndent = indent;
                }
            }
            i++;
        }
        if (typeof lowestIndent === 'number') {
            source = lines.map(function(line) {
                var firstChar = line[0];
                if (firstChar === ' ' || firstChar === '\t') {
                    return line.slice(lowestIndent);
                }
                return line;
            }).join('\n');
        }

        // eats leading and trailing whitespace too (trim)
        // source = source.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
        // handle escaped newlines at the end to ensure they don't get stripped too
        // source = source.replace(/\\n/g, '\n');

        this.source = source;
    }
    SourceCode.prototype = {
        constructor: SourceCode,
        compile: function() {
            return eval(this.source); // eslint-disable-line no-eval
        }
    };

    function createSourceCode() {
        return jsenv.construct(SourceCode, arguments);
    }

    function isSourceCode(a) {
        return a instanceof SourceCode;
    }

    return {
        create: createSourceCode,
        is: isSourceCode
    };
})();
function transpile(strings) {
    // var raw = strings.raw;
    var i = 0;
    var j = strings.length;
    var result = strings[i];
    i++;
    while (i < j) {
        result += arguments[i];
        result += strings[i];
        i++;
    }
    const sourceCode = SourceCode.create(result);
    // console.log('the result', result, sourceCode.source);
    return function(_, transmit) {
        var value;
        try {
            value = sourceCode.compile();
            transmit(value);
        } catch (e) {
            throw e;
        }
        return value;
    };
}
export {transpile};

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
export {collectKeys};

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
function consumeIterator(iterator) {
    var values = [];
    var next = iterator.next();
    while (next.done === false) {
        values.push(next.value);
        next = iterator.next();
    }
    return values;
}
export {consumeIterator};
function sameValues(a, b) {
    if (typeof a === 'string') {
        a = convertStringToArray(a);
    } else if (typeof a === 'object' && typeof a.next === 'function') {
        a = consumeIterator(a);
    }
    if (typeof b === 'string') {
        b = convertStringToArray(b);
    } else if (typeof b === 'object' && typeof b.next === 'function') {
        b = consumeIterator(b);
    }

    // console.log('compare', a, 'and', b);

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
export {sameValues};

function createTypeExpectation(expectedType) {
    return function(value) {
        var type = typeof value;
        if (type === expectedType) {
            return true;
        }
        return fail('unexpected-type', type);
    };
}
const object = createTypeExpectation('object');
const string = createTypeExpectation('string');
const number = createTypeExpectation('number');
export {object, string, number};

function expectThrow(fn, verifyThrowValue) {
    return function() {
        try {
            fn.apply(this, arguments);
            return fail('expected-to-throw-but-returned');
        } catch (e) {
            if (verifyThrowValue) {
                if (typeof verifyThrowValue === 'function') {
                    if (verifyThrowValue(e)) {
                        return fail('throw-mismatch', e);
                    }
                    return true;
                }
                if (typeof verifyThrowValue === 'object') {
                    if (verifyThrowValue === e) {
                        return true;
                    }
                    if (typeof e === 'object') {
                        var unmatchedKey = jsenv.Iterable.find(Object.keys(verifyThrowValue), function(key) {
                            return e[key] !== verifyThrowValue[key];
                        });
                        if (unmatchedKey) {
                            return fail('throw-mismatch', {
                                expectedValue: verifyThrowValue[unmatchedKey],
                                value: e[unmatchedKey],
                                key: unmatchedKey
                            });
                        }
                        return true;
                    }
                    return fail('throw-type-mismatch');
                }
                if (verifyThrowValue === e) {
                    return true;
                }
                return fail('throw-mismatch', e);
            }
            return true;
        }
    };
}
export {expectThrow};

function createVolatileListener(fn, remove) {
    var volatile = function() {
        remove.apply(this, arguments);
        fn.apply(this, arguments);
    };
    return volatile;
}
const listenOnce = jsenv.platformPolymorph({
    browser: function(name, fn) {
        name = 'on' + name.toLowerCase();
        var old = window[name];
        var volatile = createVolatileListener(fn, function() {
            window[name] = old;
            old.apply(this, arguments);
        });
        window[name] = volatile;
    },
    node: function(name, fn) {
        var volatile = createVolatileListener(fn, function() {
            process.removeListener(name, volatile);
        });
        process.addListener(name, volatile);
    }
});
export {listenOnce};

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
export {createIterableObject};

