var _      = require('lodash');
var redis  = require('redis');
var when   = require('when');
var errors = require('./errors');

module.exports = function(options) {
  var opts = options || {}
    , RedisError = errors.RedisError
    , AcquireError = errors.AcquireError
    , LockError = errors.LockError
    , redisClient = opts.client
    , redisHost = opts.host || '127.0.0.1'
    , redisPort = opts.port || 6379
    , timeoutMs = opts.timeout || 500
    , attemptMs = opts.attempt || 100
    , attemptMax = opts.attempts || Infinity
    , keepaliveMs = opts.keepalive || 100
    , keepaliveMax = opts.keepalives || Infinity;

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
        redisClient.set([name, value, "PX", timeoutMs, "NX"],
          function(err, res) {

            if (err) {
              next(new RedisError(err));
            }
            else if (res === 'OK') {
              next(keepalive, keepaliveMs);
              cb(release);
            }
            else if (attempts++ >= attemptMax) {
              next(new AcquireError('Unable to acquire the lock'));
            }
            else if (!interval) {
              next(attempt, attemptMs);
            }
        });
      }

      /**
       * Keep the Redis Lock Alive
       */
      function keepalive() {
        redisClient.set([name, value, "PX", timeoutMs],
          function(err) {

            if (err) {
              next(new RedisError(err));
            }
            else if (keepalives++ >= keepaliveMax) {
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

        redisClient.del(name,
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
      if (!redisClient) {
        redisClient = redis.createClient(redisPort, redisHost);
      }
      if (!redisClient) {
        reject(new RedisError('Unable to connect to redis'));
      }
      else if (!name || !_.isString(name)) {
        reject(new TypeError('Lock name is not a string'));
      }
      else if (!cb || !_.isFunction(cb)) {
        reject(new TypeError('Lock callback is not a function'));
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