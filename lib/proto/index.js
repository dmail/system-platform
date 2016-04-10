/*

proto

provides: create, new, supplement, extend

see http://jsperf.com/objec-create-vs-new-function for perf.

Chome : new 28x faster than Object.create
Firefox: Object.create 5x faster than new

*/

if (!Object.create) {
    Object.create = (function() {
        function F() {}

        return function(object) {
            if (typeof object !== 'object') {
                throw new TypeError('Argument must be an object');
            }

            F.prototype = object;
            var instance = new F();
            F.prototype = null;
            return instance;
        };
    })();
}

function defineProperty(object, name, owner) {
    var descriptor = Object.getOwnPropertyDescriptor(owner, name);
    Object.defineProperty(object, name, descriptor);
}

function assignProperty(object, name, owner) {
    object[name] = owner[name];
}

var addProperty = Object.defineProperty ? defineProperty : assignProperty;

function getAllEnumerableKeys(object) {
    return Object.keys(object);
}

function getAllKeysAndSymbols(object) {
    return Object.keys(object).concat(Object.getOwnPropertySymbols(object));
}

var getAllKeys = Object.getOwnPropertySymbols ? getAllKeysAndSymbols : getAllEnumerableKeys;

function addProperties(object, owner) {
    if (Object(owner) !== owner) {
        throw new TypeError('owner must be an object');
    }

    var keys = getAllKeys(owner);
    var i = 0;
    var j = keys.length;
    for (;i < j; i++) {
        addProperty(object, keys[i], owner);
    }
}

var kind;

if (Symbol) {
    kind = 'toStringTag' in Symbol ? Symbol.toStringTag : Symbol();
} else {
    kind = '@@kind';
}

function firstLetterLowerCase(name) {
    return name[0].toLowerCase() + name.slice(1);
}

function kindOf(value) {
    var name;

    if (value === null) {
        name = 'Null';
    } else if (value === undefined) {
        name = 'Undefined';
    } else {
        var type = typeof value;

        if ((type === 'function' || type === 'object') && kind in value) {
            name = value[kind];
        } else {
            name = value.constructor.name || kindOf(Object.getPrototypeOf(value));
        }
    }

    return name;
}

function isOfKind(value, expectedKind) {
    if (typeof expectedKind !== 'string') {
        throw new TypeError('isOfKind second argument must be a string');
    }

    expectedKind = expectedKind.toLowerCase();
    var actualKind = kindOf(value).toLowerCase();
    var is = false;

    if (firstLetterLowerCase(actualKind) === firstLetterLowerCase(expectedKind)) {
        is = true;
    } else if (value !== null && value !== undefined) {
        if (expectedKind === 'Object') {
            is = true;
        } else {
            var prototype = value;
            var prototypeKindName;
            while (prototype = Object.getPrototypeOf(prototype)) { // eslint-disable-line no-cond-assign
                prototypeKindName = kindOf(prototype).toLowerCase();

                if (firstLetterLowerCase(prototypeKindName) === firstLetterLowerCase(expectedKind)) {
                    is = true;
                    break;
                }
            }
        }
    }

    return is;
}

// maybe add a defineStatic that would bind every method to the object itself

var proto = {
    kind: kind,
    kindOf: kindOf,
    isOfKind: isOfKind,

    constructor() {

    },

    toString() {
        return '[object ' + this.kindOf(this) + ']';
    },

    define: function() {
        var i = 0;
        var j = arguments.length;

        for (;i < j; i++) {
            addProperties(this, arguments[i]);
        }

        return this;
    },

    extend: function() {
        var parent;
        var object;

        if (this instanceof Function) {
            parent = this.prototype;
            object = Object.create(parent);
            addProperties(object, proto);
        } else {
            parent = this;
            object = Object.create(parent);
        }

        var args = arguments;
        var i = 0;
        var j = args.length;

        if (j > 0 && typeof args[0] === 'string') {
            i = 1;
            object[kind] = args[0];
        }
        for (;i < j; i++) {
            addProperties(object, arguments[i]);
        }

        var constructor;
        var parentConstructor;

        // when we have a custom constructor
        if (Object.prototype.hasOwnProperty.call(object, 'constructor')) {
            constructor = object.constructor;

            if (typeof constructor !== 'function') {
                throw new TypeError('constructor must be a function');
            } else if (constructor === proto.constructor) {
                // if the constructor is the proto constructor, create an intermediate function
                parentConstructor = proto.constructor;
                object.constructor = constructor = function() {
                    return parentConstructor.apply(this, arguments);
                };
            }
        } else {
            // create an intermediate function calling parentConstructor
            parentConstructor = this.constructor;
            object.constructor = constructor = function() {
                return parentConstructor.apply(this, arguments);
            };
        }

        object.super = parent;
        constructor.prototype = object;
        constructor.super = parent;

        return object;
    },

    create: function() {
        var object;

        if (this instanceof Function) {
            var length = arguments.length;

            if (length === 0) {
                return new this();
            }
            if (length === 1) {
                return new this(arguments[0]);
            }
            if (length === 2) {
                return new this(arguments[0], arguments[1]);
            }

            object = Object.create(this.prototype);
        } else {
            object = Object.create(this);
        }

        return object.constructor.apply(object, arguments) || object;
    }
};

proto[kind] = 'Prototype';

/* eslint-disable no-extend-native */
Function.prototype.create = proto.create;
Function.prototype.extend = proto.extend;
Function.prototype.isPrototypeOf = function(a) {
    return a instanceof this;
};
/* eslint-enable no-extend-native */

export default proto;