// https://github.com/zloirock/core-js/blob/v2.4.1/modules/_parse-int.js
expose(
    {
        pass: function(parseInt) {
            var ws = '\x09\x0A\x0B\x0C\x0D\x20\xA0\u1680\u180E\u2000\u2001\u2002\u2003';
            ws += '\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000\u2028\u2029\uFEFF';

            return (
                parseInt(ws + '08') === 8 &&
                parseInt(ws + '0x16') === 22
            );
        },
        solution: {
            type: 'corejs',
            value: 'es6.parse-int'
        }
    }
);
