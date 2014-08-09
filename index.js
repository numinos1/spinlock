var _      = require('lodash');
var redis  = require('redis');
var when   = require('when');

module.exports = function(options) {

  /**
   * Default Options
   * @type {object}
   */
  options = _.extend({
    host: "127.0.0.1",
    port: 6379,
    timeout: 500,
    request: 100,
    requests: Infinity,
    keepalive: 100,
    keepalives: Infinity
  }, options);

  /**
   * Set or Create the Redis Client
   * @type {redis}
   */
  var client = options.client
    || redis.createClient(options.port, options.host);

  /**
   * Acquire a Spinlock
   *
   * @param  {String}   name    The name of the spinlock
   * @param  {Function} cb      Callback handler
   * @return {Promise}          Return a promise object
   */
  function acquire(name, cb) {
    return when.promise(function(resolve, reject) {
      var requests = 0
        , keepalives = 0
        , interval = null
        , value = 'someval';

      /**
       * Request a Redis Lock
       */
      function request() {
        client.set([name, value, "PX", options.timeout, "NX"],
          function(err, res) {

            if (err) {
              next("REQUEST_ERROR");
            }
            else if (res === 'OK') {
              next(keepalive, options.keepalive);
              cb(release);
            }
            else if (requests++ >= options.requests) {
              next("REQUEST_TIMEOUT");
            }
            else if (!interval) {
              next(request, options.request);
            }
        });
      }

      /**
       * Keep the Redis Lock Alive
       */
      function keepalive() {
        client.set([name, value, "PX", options.timeout],
          function(err) {

            if (err) {
              next("REFRESH_ERROR");
            }
            else if (keepalives++ >= options.keepalives) {
              next("REFRESH_TIMEOUT");
            }
        });
      }

      /**
       * Release the Redis Lock
       *
       * @param  {[type]} err  Release Error
       * @param  {[type]} data Release Data
       */
      function release(err, data) {
        next();

        client.del(name,
          function(error) {

            if (error) {
              reject("RELEASE_ERROR");
            }
            else if (err) {
              reject(err);
            }
            else {
              resolve(data);
            }
        });
      }

      /**
       * Next Time Interval
       *
       * @param  {String|Function}   handler
       * @param  {Number}            time
       */
      function next(handler, time) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
        if (handler && time) {
          interval = setInterval(handler, time);
        }
        else if (handler) {
          reject(handler);
        }
      }

      /**
       * Start the Request Polling
       */
      if (!name || !_.isString(name)) {
        reject("NAME_ERROR");
      }
      else if (!cb || !_.isFunction(cb)) {
        reject("CALLBACK_ERROR");
      }
      else if (!client) {
        reject("REDIS_ERROR");
      }
      else {
        request();
      }

    });
  }

  /**
   * Return the Spinlock Object
   */
  return {
    acquire: acquire
  };

};