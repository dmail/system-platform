// https://github.com/SitePen/remap-istanbul/blob/master/lib/remap.js

import jsenv from 'jsenv';
import proto from 'env/proto';

import require from '@node/require';

var istanbul = require('istanbul');
var sources = jsenv.sources;

const RemappedSourceCoverage = proto.extend('RemappedSourceCoverage', {
    constructor(filename) {
        this.coverage = {
            path: filename,
            statementMap: {},
            fnMap: {},
            branchMap: {},
            s: {},
            b: {},
            f: {}
        };
        this.meta = {
            indexes: {},
            lastIndex: {
                s: 0,
                b: 0,
                f: 0
            }
        };
    }
});

const SourceCoverageRemapper = proto.extend('SourceCoverageRemapper', {
    constructor(key) {
        this.key = key;
    },

    getRemappedSourceCoverage(sourceURL) {
        var source;
        if (sourceURL.indexOf('file:///') === 0) {
            source = sourceURL.slice('file:///'.length);
            if (jsenv.platform.name === 'windows') {
                // replace all slash by backslashes
                source = source.replace(/\//g, '\\');
            }
        } else {
            source = sourceURL;
        }

        var remappedSourceCoverage;

        if (this.sourceCoverages.has(source)) {
            remappedSourceCoverage = this.sourceCoverages.get(source);
        } else {
            remappedSourceCoverage = RemappedSourceCoverage.create(source);

            if (this.sourceCoverage.code) {
                remappedSourceCoverage.coverage.code = this.fileSource.getOriginalSource().split(/(?:\r?\n)|\r/);
            }
            this.sourceCoverages.set(source, remappedSourceCoverage);
        }

        return remappedSourceCoverage;
    },

    getOriginalPosition(location) {
        return this.fileSource.getOriginalPosition(location);
    },

    getMapping(location) {
        /* jshint maxcomplexity: 11 */
        var start = this.getOriginalPosition(location.start);
        var end = this.getOriginalPosition(location.end);

        /* istanbul ignore if: edge case too hard to test for */
        if (!start || !end) {
            return null;
        }
        if (!start.source || !end.source || start.source !== end.source) {
            return null;
        }
        /* istanbul ignore if: edge case too hard to test for */
        if (start.line === null || start.column === null) {
            return null;
        }
        /* istanbul ignore if: edge case too hard to test for */
        if (end.line === null || end.column === null) {
            return null;
        }
        // var src = start.source;

        if (start.line === end.line && start.column === end.column) {
            end = this.getOriginalPosition({
                line: location.end.line,
                column: location.end.column,
                bias: 2
            });
            end.column--;
        }

        return {
            source: start.source,
            loc: {
                start: {
                    line: start.line,
                    column: start.column
                },
                end: {
                    line: end.line,
                    column: end.column
                },
                skip: location.skip
            }
        };
    },

    each(object, fn, bind) {
        Object.keys(object).forEach(function(key) {
            fn.call(bind, object[key], key, object);
        });
        return object;
    },

    remapFns(sourceCoverage) {
        this.each(sourceCoverage.fnMap, function(genItem, key) {
            var mapping = this.getMapping(genItem.loc);
            if (!mapping) {
                return;
            }

            var hits = sourceCoverage.f[key];
            var remappedSourceCoverage = this.getRemappedSourceCoverage(mapping.source);
            var coverage = remappedSourceCoverage.coverage;
            var meta = remappedSourceCoverage.meta;
            var srcItem = {
                name: genItem.name,
                line: mapping.loc.start.line,
                loc: mapping.loc
            };
            if (genItem.skip) {
                srcItem.skip = genItem.skip;
            }
            var originalKey = [
                'f',
                srcItem.loc.start.line, srcItem.loc.start.column,
                srcItem.loc.end.line, srcItem.loc.end.column
            ].join(':');

            var fnIndex = meta.indexes[originalKey];
            if (!fnIndex) {
                fnIndex = ++meta.lastIndex.f;
                meta.indexes[originalKey] = fnIndex;
                coverage.fnMap[fnIndex] = srcItem;
            }
            coverage.f[fnIndex] = coverage.f[fnIndex] || 0;
            coverage.f[fnIndex] += hits;
        }, this);
    },

    remapStatements(sourceCoverage) {
        this.each(sourceCoverage.statementMap, function(genItem, key) {
            var mapping = this.getMapping(genItem);
            if (!mapping) {
                return;
            }

            var hits = sourceCoverage.s[key];
            var remappedSourceCoverage = this.getRemappedSourceCoverage(mapping.source);
            var coverage = remappedSourceCoverage.coverage;
            var meta = remappedSourceCoverage.meta;

            var originalKey = [
                's',
                mapping.loc.start.line, mapping.loc.start.column,
                mapping.loc.end.line, mapping.loc.end.column
            ].join(':');

            var stIndex = meta.indexes[originalKey];
            if (!stIndex) {
                stIndex = ++meta.lastIndex.s;
                meta.indexes[originalKey] = stIndex;
                coverage.statementMap[stIndex] = mapping.loc;
            }
            coverage.s[stIndex] = coverage.s[stIndex] || 0;
            coverage.s[stIndex] += hits;
        }, this);
    },

    remapBranches(sourceCoverage) {
        this.each(sourceCoverage.branchMap, function(genItem, key) {
            var locations = [];
            var source;
            var originalKey = ['b'];

            var mappings = genItem.locations.map(function(location) {
                return this.getMapping(location);
            }).filter(function(mapping) {
                return mapping;
            });

            var firstSource = mappings[0];
            var sourceMappings = mappings.filter(function(mapping) {
                return mapping.source === firstSource;
            });

            sourceMappings.forEach(function(sourceMapping) {
                locations.push(sourceMapping.loc);
                originalKey.push(
                    sourceMapping.loc.start.line,
                    sourceMapping.loc.start.column,
                    sourceMapping.loc.end.line,
                    sourceMapping.loc.end.line
                );
            });

            originalKey = originalKey.join(':');

            var hits = sourceCoverage.b[key];
            var remappedSourceCoverage = this.getRemappedSourceCoverage(source);
            var coverage = remappedSourceCoverage.coverage;
            var meta = remappedSourceCoverage.meta;

            var brIndex = meta.indexes[originalKey];
            if (!brIndex) {
                brIndex = ++meta.lastIndex.b;
                meta.indexes[originalKey] = brIndex;
                coverage.branchMap[brIndex] = {
                    line: locations[0].start.line,
                    type: genItem.type,
                    locations: locations
                };
            }

            if (!coverage.b[brIndex]) {
                coverage.b[brIndex] = locations.map(function() {
                    return 0;
                });
            }

            hits.forEach(function(hit, index) {
                coverage.b[brIndex][index] += hits[index];
            });
        }, this);
    },

    remap(sourceCoverage) {
        // il faut savoir où cherche sourceCoverage.path
        this.sourceCoverage = sourceCoverage;
        this.fileSource = sources.get(jsenv.cleanPath(sourceCoverage.path));
        this.sourceCoverages = new Map();

        return this.fileSource.prepare().then(function() {
            if (this.fileSource.sourceMap) {
                this.remapFns(sourceCoverage);
                this.remapStatements(sourceCoverage);
                this.remapBranches(sourceCoverage);
            } else {
                console.warn(new Error('Could not find source map for: "' + sourceCoverage.path + '"'));
                this.sourceCoverages.set(this.key, sourceCoverage);
            }
        }.bind(this)).then(function() {
            // one source coverage creates a group of remappedSourceCoverage (to support concatened sources)
            var remappedSourceCoverageGroup = {};

            for (let remappedSourceCoverageEntry of this.sourceCoverages.entries()) {
                let remappedSourceCoverageKey = remappedSourceCoverageEntry[0];
                let remappedSourceCoverage = remappedSourceCoverageEntry[1];

                remappedSourceCoverageGroup[remappedSourceCoverageKey] = remappedSourceCoverage.coverage;
            }

            return remappedSourceCoverageGroup;
        }.bind(this));
    }
});

const ConverageRemapper = proto.extend('ConverageRemapper', {
    constructor(options) {
        this.options = options;
    },

    remap(coverage) {
        var coverageKeys = Object.keys(coverage);
        var exclude;

        if (exclude) {
            coverageKeys = coverageKeys.filter(function(fileName) {
                if (exclude(fileName)) {
                    console.warn('Excluding: "' + fileName + '"');
                    return false;
                }
                return true;
            });
        }

        // create a sourceCoverageRemapper for each
        var sourceCoverageRemappers = coverageKeys.map(function(key) {
            return SourceCoverageRemapper.create(key);
        });

        // remap all sourceCoverage
        var sourceCoveragePromises = sourceCoverageRemappers.map(function(sourceCoverageRemapper) {
            return sourceCoverageRemapper.remap(coverage[sourceCoverageRemapper.key]);
        });

        // get the remapped coverage
        return Promise.all(sourceCoveragePromises).then(function(remappedSourceCoverageGroups) {
            var remappedCoverage = {};

            for (let remappedSourceCoverageGroup of remappedSourceCoverageGroups) {
                Object.assign(remappedCoverage, remappedSourceCoverageGroup);
            }

            return remappedCoverage;
        });
    }
});

function remap(coverage, options) {
    options = options || {};

    var remapper = ConverageRemapper.create();

    return remapper.remap(coverage).then(function(remappedCoverage) {
        var collector = new istanbul.Collector();

        collector.add(remappedCoverage);

        /* refreshes the line counts for reports */
        var updatedCoverage = collector.getFinalCoverage();

        return updatedCoverage;
    });
}

export default remap;
