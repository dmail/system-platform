this.code = transpile`(function(outsideValue, insideValue) {
    const foo = outsideValue;
    for(const foo = insideValue; false;) {}
    return foo;
})`;
this.pass = function(fn) {
    var outsideValue = 0;
    var insideValue = 1;
    var result = fn(outsideValue, insideValue);
    return result === outsideValue;
};
this.solution = {
    type: 'transpile',
    name: 'transform-es2015-for-of'
};