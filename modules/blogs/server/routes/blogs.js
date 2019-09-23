var myController = require('../controllers/blogs');
/**
 * Init the controller
 */
module.exports = function(System) {
    var blogs = myController(System);
  
    var routes = [];
    
    routes.push({
      method: 'post',
      path: '/blogs/add',
      handler: blogs.create,
      authorized: true
    });
    
    routes.push({
      method: 'post',
      path: '/',
      handler: blogs.create,
      authorized: true
    });
    routes.push({
      method: 'get',
      path: '/',
      handler: blogs.feed,
      authorized: true
    });
  
    routes.push({
      method: 'get',
      path: '/:blogId',
      handler: blogs.single,
      authorized: false
    });
  
    routes.push({
      method: 'post',
      path: '/:blogId/like',
      handler: blogs.like,
      authorized: true
    });
  
    routes.push({
      method: 'post',
      path: '/:blogId/comment',
      handler: blogs.comment,
      authorized: true
    });
  
    routes.push({
      method: 'get',
      path: '/:blogId/likes',
      handler: blogs.likes,
      authorized: true
    });
  
    routes.push({
      method: 'post',
      path: '/:blogId/unlike',
      handler: blogs.unlike,
      authorized: true
    });
    
    return routes;
}