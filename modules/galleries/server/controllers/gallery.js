var mongoose = require('mongoose');
var Gallery = mongoose.model('Gallery');

module.exports = function(System) {
  var obj = {};
  var json = System.plugins.JSON;
  var event = System.plugins.event;
  var sck = System.webSocket;

  obj.list = function(){
    var data = {response:'gallery'};  
    return data;
  }
  
  return obj;
};