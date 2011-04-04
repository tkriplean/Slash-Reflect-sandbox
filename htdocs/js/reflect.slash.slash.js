





// _*_ Mode: JavaScript; tab-width: 8; indent-tabs-mode: true _*_
; // $Id$

//var $j = jQuery.noConflict();
var $j = jQuery;

Reflect.config.study = false;
Reflect.config.enable_flagging = false;

var is_new_slash = false;

new_slash = {
          comment_identifier: '.full',
          comment_offset:5,
          comment_text:'div.rf-comment',
          get_commenter_name: function(comment_id){
                    var name = $j('#comment_top_'+comment_id+ ' .by a:first').text();
                    if (name=='' || name=="undefined"){
                        name = 'Anonymous coward';
                    }
                    return name;}
      };

old_slash = {
                comment_identifier: '.full',
                comment_offset:8,
                comment_text:'div.rf-comment',
                get_commenter_name: function(comment_id){
                          var name = $j('#comment_top_'+comment_id+ ' .details > a:first').text();
                          if (name=='' || name=="undefined"){
                              name = 'Anonymous coward';
                          }
                          else {
                            var idx = name.indexOf('(');
                            if ( idx > -1 ) {
                              name = name.substring(0, idx - 1);
                            }
                          }
                          return name;
                      }
            };
      
      
      
$j.extend(Reflect.config.contract, {
	components: [{true:new_slash,false:old_slash}[is_new_slash]]});


Reflect.Contract = Reflect.Contract.extend({
	user_name_selector : {true: '#userbio_self-title a:first', false: '#user-info-content > a:first'}[is_new_slash],
	modifier: function(){
    $j('.full .commentBody').each(function(){
        $j(this).children('div:first').addClass('rf-comment');
    });
	},
	get_comment_thread: function(){
	    return $j('#commentlisting');
	}
});

$j.extend(Reflect.config.api, {
   domain : 'slash',
	server_loc: '',
	media_dir: 'media/'
});

Reflect.api.DataInterface = Reflect.api.DataInterface.extend({

	init: function(config){
		this._super(config);
		this.api_loc = this.server_loc + '/reflect.pl';
	},
   	get_templates: function(callback){
   		$j.get(this.server_loc + '/reflect_client_templates.html',callback);
   	},
   	get_current_user: function(){
		  return 'Anonymous coward';
   	},	
	post_bullet: function(settings){
      settings.params.op = 'bullet';
	  
        $j.ajax({url:this.api_loc,
                type:'POST',
                data: settings.params,
                async: true,
                error: function(data){
                    var json_data = JSON.parse(data);
                    settings.error(json_data);
                },
                success: function(data){
                    var json_data = JSON.parse(data);
                    settings.success(json_data);
                }
        });
    },
	post_response: function(settings){
	  settings.params.op = 'response';
    
    	$j.ajax({url:this.api_loc,
            type:'POST',
            data: settings.params,
            async: true,
            error: function(data){
                var json_data = JSON.parse(data);
                settings.error(json_data);
            },
            success: function(data){
                var json_data = JSON.parse(data);
                settings.success(json_data);
            }
    	});
    },
	
	get_data: function(params, callback){
	  params.op = 'data';
    
        $j.getJSON(this.api_loc, params, callback);
	}
});