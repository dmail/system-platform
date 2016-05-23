import jsenv from 'jsenv';

import Headers from './headers.js';
import Body from './body.js';
import Response from './response.js';
import Request from './request.js';
import Service from './service.js';
import ResponseGeneratorWithServices from './response-generator-service.js';

// import polymorph from './util/polymorph.js';

import proto from 'proto';

var rest = proto.extend('Rest', {
    constructor(uri) {
        this.Request = Request.extend({
            baseURI: jsenv.createURI(uri)
        });
        this.ResponseGenerator = ResponseGeneratorWithServices.extend({services: []});
        this.services = this.ResponseGenerator.services;
    },

    createURI() {
        return this.Request.baseURI.clone();
    },

    createHeaders(properties) {
        return Headers.create(properties);
    },

    createBody(data) {
        return Body.create(data);
    },

    createResponse(properties) {
        return Response.create(properties);
    },

    createRequest(properties) {
        return this.Request.create(properties);
    },

    // service properties
    createService(options) {
        return Service.extend(options);
    },

    use(service) {
        this.services.push(service);
        // note : take into account service.priority and sort them
        return service;
    },

    findServiceByName(name) {
        return this.services.find(function(service) {
            return service.name === name;
        });
    },

    findServiceMatch(request) {
        return this.ResponseGenerator.match(request);
    },

    removeService(service) {
        this.services.splice(this.services.indexOf(service), 0, 1);
        return this;
    },

    // generating response
    createResponsePromiseForRequest(request) {
        var responseGenerator = this.ResponseGenerator.create(request);
        return responseGenerator;
    },

    fetch() {
        if (this.Request.isPrototypeOf(arguments[0])) {
            return this.createResponsePromiseForRequest(arguments[0]);
        }

        var uri = arguments[0];
        var options = arguments[1] || {};
        var request;

        try {
            options.uri = uri;
            request = this.createRequest(options);
        } catch (e) {
            return Promise.reject(e);
        }

        return this.fetch(request);
    },

    get(uri, options = {}) {
        options.method = 'GET';

        return this.fetch(uri, options);
    },

    post(uri, body, options = {}) {
        options.method = 'POST';
        options.body = body;

        return this.fetch(uri, options);
    },

    put(uri, body, options = {}) {
        options.method = 'PUT';
        options.body = body;

        return this.fetch(uri, options);
    },

    delete(uri, options = {}) {
        options.method = 'DELETE';

        return this.fetch(uri, options);
    }
});

rest.constructor(jsenv.baseURI);

/*
use: polymorph(
    [Function],
    function(requestHandler){
        var service = this.createService({
            name: requestHandler.name,
            requestHandler: requestHandler
        });
        return this.use(service);
    },

    [,Function],
    function(requestHandler, responseHandler){
        var service = this.createService({
            name: responseHandler.name,
            responseHandler: responseHandler
        });
        return this.use(service);
    },

    [Function, Function],
    function(requestHandler, responseHandler){
        var service = this.createService({
            name: requestHandler.name,
            requestHandler: requestHandler,
            responseHandler: responseHandler
        });

        return this.use(service);
    },

    [Service],
    function(service){
        return this.addService(service);
    }
)
*/

export default rest;