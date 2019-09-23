module.exports = function(System) {
    /**
     * The helper register method
     * @return {Void}
     */
    var fs = require('fs');
    var plugin = {
        register: function(){
            return{
                sendToPHPServer: function(file, image_id, stream_id){
                    var request = require('request');
                    if(!stream_id){
                    stream_id = 0;
                    }
                    var formData = {
                    image: {
                        value: fs.createReadStream(file.path),
                        options: {
                        filename: file.originalname,
                        contentType: file.mimeType
                        }
                    },
                    'image_id': image_id,
                    'stream_id': stream_id,
                    };
                    var uploadOptions = {
                        "url": System.config.IMG_STATIC+"/upload.php",
                        "method": "POST",
                        "headers": {
                            //"Authorization": "Bearer " + accessToken
                        },
                        "formData": formData
                    }
                    var req = request(uploadOptions, function(err, resp, body) {
                        try{
                        body = JSON.parse(body);
                        }catch(ex){
                        console.log('Not a JSON string ', ex);
                        }
                        if (err) {
                            console.log('Error ', err);
                            return err;
                        } else {
                            console.log('upload successful', JSON.stringify(body));
                            return body;
                        }
                    });
                },
                deleteImgFromPHPServer: function(image_id, stream_id){
                    var request = require('request');
                    if(!stream_id){
                    stream_id = 0;
                    }
                    var params = {
                    "image_id": image_id,
                    "stream_id": stream_id,
                    }
                    var options = {
                        "url": System.config.IMG_STATIC+"/delete.php",
                        "method": "POST",
                        "headers": {
                            //"Authorization": "Bearer " + accessToken
                        },
                        "formData": params,
                    }
                    var req = request(options, function(err, resp, body) {
                        try{
                            body = JSON.parse(body);
                        }catch(ex){
                            console.log("Error body", body);
                            console.log(ex);
                            return "Unable to communicate image server: JOSN Body parse error";
                        }
                        if (err) {
                            console.log('Error ', err);
                            return err;
                        } else {
                            console.log('deleted successful', JSON.stringify(body));
                            return body;
                        }
                    });
                },
            }
        }
    };
    /**
    * Attributes to identify the plugin
    * @type {Object}
    */
    plugin.register.attributes = {
        name: 'Image Helper',
        key: 'Image',
        version: '1.0.0'
    };
    return plugin;
}