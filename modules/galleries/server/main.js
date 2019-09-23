var routes = require('./routes/gallery');

module.exports = function(System) {
  /**
   * Name of this module
   * @type {String}
   */
  var moduleName = 'galleries';

  /**
   * Build the routes
   * @type {Array}
   */
  var builtRoutes = routes(System);

  /**
   * Add routes to System
   */
  System.route(builtRoutes, moduleName);
};