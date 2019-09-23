var myController = require('../controllers/gallery');
/**
 * Init the controller
 */
module.exports = function(System) {
    var gallery = myController(System);
  
    var routes = [];
    
    routes.push({
        method: 'get',
        path: '/',
        handler: gallery.list,
        authorized: true
    });

    return routes;
}