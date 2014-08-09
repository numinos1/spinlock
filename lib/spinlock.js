var _      = require('lodash');
var redis  = require('redis');
var when   = require('when');
var errors = require('./errors');

module.exports = function(options) {
  var RedisError = errors.RedisError
    , AcquireError = errors.AcquireError
    , LockError = errors.LockError;

  /**
   * Default Options
   * @type {object}
   */
  options = _.extend({
    host: "127.0.0.1",
    port: 6379,
    timeout: 500,
    attempt: 100,
    attempts: 0,
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
      var attempts = 0
        , keepalives = 0
        , interval = null
        , value = 'someval';

      /**
       * Request a Redis Lock
       */
      function attempt() {
        client.set([name, value, "PX", options.timeout, "NX"],
          function(err, res) {

            if (err) {
              next(new RedisError(err));
            }
            else if (res === 'OK') {
              next(keepalive, options.keepalive);
              cb(release);
            }
            else if (attempts++ >= options.attempts) {
              next(new AcquireError('Unable to acquire the lock'));
            }
            else if (!interval) {
              next(attempt, options.attempt);
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
              next(new RedisError(err));
            }
            else if (keepalives++ >= options.keepalives) {
              next(new LockError('Lock keepalive timeout'));
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
              reject(new RedisError(error));
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
        reject(new TypeError('Lock name is not a string'));
      }
      else if (!cb || !_.isFunction(cb)) {
        reject(new TypeError('Lock callback is not a function'));
      }
      else if (!client) {
        reject(new RedisError('Unable to connect to redis'));
      }
      else {
        attempt();
      }

    });
  }

  /**
   * Return the Spinlock Object
   */
  return {
    acquire: acquire,
    RedisError: RedisError,
    AcquireError: AcquireError,
    LockError: LockError
  };

};