#!/opt/local/bin/perl
# This code is released under the GPL.
# Copyright 2011 Travis Kriplean.
#
# Slash backend for Reflect (http://www.cs.washington.edu/homes/travis/reflect/)

use strict;
use warnings;

use Slash;
use Slash::Display;
use Slash::Utility;
use Slash::Messages;
use Slash::Utility::Data;

use Data::Dumper;


sub __get_user_info {
	my $user = getCurrentUser();
	my $user_name = $user->{nickname};
	my $is_anon = !$user_name || $user_name eq ''; 

	my $uid = $user->{uid};
	if ( $is_anon ){
		my $user_name = 'Anonymous Coward';
	}
	return { 'name' => $user_name, 'id' => $uid, 'is_anon' => $is_anon };
}


sub set_summary_message {
  my($comment, $summarizer, $summary) = @_;

  my $slashdb = getCurrentDB();
  my $user = $slashdb->getUser($comment->{uid});

	my $summary_message_code = $slashdb->sqlSelect(
	  'code', 'message_codes', "type = 'Reflect summary'");
  my $messages = getObject('Slash::Messages');
  if ($messages && $summary_message_code) {
    my $users = $messages->checkMessageCodes($summary_message_code, [$comment->{uid}]);
    if (scalar @$users) {
      my $data  = {
        template_name   => 'rf_summary_msg',
        template_page   => 'reflect',
        subject         => {
          template_name => 'rf_summary_msg_subj',
          template_page => 'reflect',
        },
        comment     => $comment,
        summary     => $summary,
        summarizer  => $summarizer,
        discussion  => $slashdb->getDiscussion($comment->{sid})
      };
      $messages->create($comment->{uid}, $summary_message_code, $data);
    }
  }
}

####
# Handles all requests

sub main {
	my $options = {};
	my $params = getCurrentForm();
	
	my $op = $params->{'op'};
	my $retval;
	
	if ( $op eq 'data' ) {
		$retval = get_data($params->{'comments'});
	} elsif ( $op eq 'response' ) {
		if ( exists $params->{'delete'} && $params->{'delete'} eq 'true' ) { 
			$retval = delete_response( $params->{'response_id'} );
		} elsif ( exists $params->{'response_id'} ) {
			$retval = update_response( $params->{'comment_id'}, $params->{'bullet_id'}, 
				$params->{'response_id'}, $params->{'text'}, $params->{'signal'} );
		} else {
			$retval = create_response( $params->{'comment_id'}, $params->{'bullet_id'}, 
				$params->{'text'}, $params->{'signal'});
		}		
	} elsif ( $op eq 'bullet' ) {
		if ( exists $params->{'delete'} && $params->{'delete'} eq 'true' ) { 
			$retval = delete_bullet( $params->{'bullet_id'} );
		} elsif ( exists $params->{'bullet_id'} ) {
			$retval = update_bullet( $params->{'comment_id'}, $params->{'bullet_id'}, 
				$params->{'text'}, $params->{'highlights'} );
		} else {
			$retval = create_bullet( $params->{'comment_id'}, $params->{'text'}, 
				$params->{'highlights'});
		}
	} elsif ( $op eq 'bullet_rating' ) {
	  my $is_delete = exists $params->{'is_delete'} && $params->{'is_delete'} eq 'true';	  
		if ( exists $params->{'bullet_id'} ) {
			$retval = create_bullet_rating( $params->{'comment_id'}, 
			  $params->{'bullet_id'}, $params->{'bullet_rev'}, $params->{'rating'}, $is_delete );
		}	  
	}
	
	$options->{content_type} = 'application/json';	
	http_send($options);
	if ($op eq 'data') {
		print Data::JavaScript::Anon->anon_dump($retval);
	} else {
	  print $retval;
	}
}

###
# Callback for getting reflect data.
#
# @param array $comments
# @return hash ref
sub get_data {
	my $slashdb = getCurrentDB();
	my($str_comments) = @_;
	my $data = {};
	
	
	my @comments = ($str_comments =~ /\d+/g); 
	foreach my $comment_id (@comments) {
		my $bullets = {};
		my $db_bullets = $slashdb->sqlSelectAll( 
			'bullet_id, id, created, user, txt, score', 
			'reflect_bullet_revision', 
			"active=1 AND comment_id=$comment_id"
		);

		my $db_ratings = $slashdb->sqlSelectAll( 
			'bullet_id, rating', 
			'reflect_bullet_rating', 
			"comment_id=$comment_id"
		);
		
		foreach my $db_bullet (@$db_bullets){
			my $bullet = {
				'id' => @$db_bullet[0],
				'rev' => @$db_bullet[1],
				'ts' => @$db_bullet[2],
				'u' => @$db_bullet[3],
				'txt' => @$db_bullet[4],
				'score' => @$db_bullet[5]
			};
			foreach my $db_rating (@$db_ratings){
			  if (@$db_rating[0] == @$db_bullet[0]) {
			    $bullet->{'my_rating'} = @$db_rating[1];
			  }
			}
			
			my $db_highlights = $slashdb->sqlSelectAll(
				'element_id',
				'reflect_highlight',
				"bullet_rev=" . $bullet->{rev}
			);
			
			my @highlights = ();
			foreach my $highlight (@$db_highlights) {
				push(@highlights, {'eid' => @$highlight[0]});
			}
			$bullet->{'highlights'} = \@highlights;
			
			my $db_responses = $slashdb->sqlSelectAll(
				'response_id,id,created,user,txt,signal',
				'reflect_response_revision',
				'active=1 AND bullet_id=' . $bullet->{id}
			);

			my $responses = {};
			foreach my $db_response (@$db_responses) {
				
				my $response = {
					'id' => @$db_response[0],
					'rev' => @$db_response[1],
					'ts' => @$db_response[2],
					'sig' => @$db_response[5],
					'txt' => @$db_response[4],
					'u' => @$db_response[3]
				};
				$responses->{$response->{id}} = $response;
			}
			$bullet->{responses} = $responses;
			$bullets->{$bullet->{id}} = $bullet;
		}
		$data->{$comment_id} = $bullets;
	}

	return $data;
 }

#####################
## API for Bullets ##
#####################

sub create_bullet {
	my($comment_id, $text, $str_highlights) = @_;
	my $slashdb = getCurrentDB();	
	my $user_info = __get_user_info();
		
	#server side permission check for this operation...
	my $commenter = $slashdb->sqlSelect('uid', 'comments', "cid = $comment_id");
	if($commenter == $user_info->{id} || $text eq '') {
	  return '';
	}	
	
	$slashdb->sqlInsert(
		'reflect_bullet', { 'comment_id' => $comment_id }
	);
	
	my $bullet_id = $slashdb->getLastInsertId();

	my $bullet_revision_params = { 
		'comment_id' => $comment_id,
		'bullet_id' => $bullet_id,
		'txt' => strip_nohtml($text),
		'user' => $user_info->{name},
		'user_id' => $user_info->{id},
		'active' => 1
	};
	
	$slashdb->sqlInsert(
		'reflect_bullet_revision',
		$bullet_revision_params
	);
	my $bullet_rev_id = $slashdb->getLastInsertId();
	
	my @highlights = ($str_highlights =~ /\d+/g); 

	foreach my $value (@highlights) {
		my $highlight_params = { 
			'bullet_id' => $bullet_id,
			'bullet_rev' => $bullet_rev_id,
			'element_id' => $value
		};
		$slashdb->sqlInsert(
			'reflect_highlight',
			$highlight_params
		);
	}

	# send message to commenter that their point was summarized...
	my($sid, $uid, $subject) = $slashdb->sqlSelect(
		'sid, uid, subject',
		'comments',
		"cid=$comment_id"
	);
	
	my $comment = {
	  'sid' => $sid,
	  'cid' => $comment_id,
	  'uid' => $uid,
	  'subject' => $subject
	};

	set_summary_message($comment, $user_info, $bullet_revision_params);	
	my $name = $user_info->{name};
	return "{\"insert_id\":$bullet_id, \"u\":\"$name\", \"rev_id\": $bullet_rev_id}";
	
}

sub update_bullet {
	my($comment_id, $bullet_id, $text, $str_highlights) = @_;
	my $user_info = __get_user_info();
	my $slashdb = getCurrentDB();	
	
	#server side permission check for this operation...
	my $summarizer = $slashdb->sqlSelect(
	  'user_id', 'reflect_bullet_revision', 
	  "bullet_id = $bullet_id AND active = 1");
	if($summarizer != $user_info->{id} || $text eq '') {
	  return "{}";
	}	
	
	$slashdb->sqlUpdate(
		'reflect_bullet_revision',
		{'active' => 0},
		'bullet_id=' . $bullet_id
	);
	
	my $bullet_revision_params = { 
		'comment_id' => $comment_id,
		'bullet_id' => $bullet_id,
		'txt' => strip_nohtml($text),	
		'user' => $user_info->{name},
		'user_id' => $user_info->{id},
		'active' => 1
	};	
	
	$slashdb->sqlInsert(
		'reflect_bullet_revision',
		$bullet_revision_params
	);
	my $bullet_rev_id = $slashdb->getLastInsertId();

	my @highlights = ($str_highlights =~ /\d+/g); 
	foreach my $value (@highlights) {
		my $highlight_params = {
			'bullet_id' => $bullet_id,
			'bullet_rev'=> $bullet_rev_id,
			'element_id' => $value
		};
		$slashdb->sqlInsert(
			'reflect_highlight',
			$highlight_params
		);
	}
	my $name = $user_info->{name};
	return "{\"insert_id\":$bullet_id,\"u\":\"$name\",\"rev_id\":$bullet_rev_id}";	
}

sub delete_bullet {
	my($bullet_id) = @_;
	my $slashdb = getCurrentDB();	
	my $user_info = __get_user_info();

	#server side permission check for this operation...
	my $summarizer = $slashdb->sqlSelect(
	  'user_id', 'reflect_bullet_revision', 
	  "bullet_id = $bullet_id AND active = 1");
	if($summarizer != $user_info->{id}) {
	  return "{}";
	}

  # attempt to remove any web-messages alerting the commenter that this bullet was created	
  my $message_code = $slashdb->sqlSelect('code', "type = 'Reflect summary'");
	my $bullet_txt = $slashdb->sqlSelect(
	  'txt', 'reflect_bullet_revision', 
	  "bullet_id = $bullet_id AND active = 1");
	my $message_id = $slashdb->sqlSelect(
	  't.id', 'message_web_text as t, message_web as m',
	  "m.code=$message_code AND m.id=t.id AND t.message like '\%$bullet_txt\%'"
	);
	if ($message_id) {
    $slashdb->sqlDelete('message_web', "id=$message_id");
    $slashdb->sqlDelete('message_web_text', "id=$message_id");
	} else {
	  # if it wasn't in web_messages, notifications might not have been sent yet...
	  $slashdb->sqlDelete('message_drop', 
	    "code=$message_code AND message like '\%$bullet_txt\%"
	  );
	}
  ##############
  
	$slashdb->sqlUpdate(
		'reflect_bullet_revision',
		{'active' => 0},
		"bullet_id=$bullet_id"
	);
	return "{}";
}

sub create_bullet_rating {
	my($comment_id, $bullet_id, $bullet_rev, $rating, $is_delete) = @_;
	my $slashdb = getCurrentDB();	
	my $user_info = __get_user_info();
	my $uid = $user_info->{id};
	
	#server side permission check for this operation...
	my $commenter = $slashdb->sqlSelect('uid', 'comments', "cid = $comment_id");
	my $summarizer = $slashdb->sqlSelect('user_id', 'reflect_bullet_revision', "id = $bullet_rev");
	if($commenter == $uid || 
	   $user_info->{is_anon} || 
	   ($uid != 0 && $summarizer == $uid) ) {
	  return "{}";
	}

	$slashdb->sqlDelete(
		'reflect_bullet_rating', 
		"user_id=$uid AND bullet_id=$bullet_id"
	);
	
	if(!$is_delete) {
    my %scores = ('zen' => 3, 'gold' => 2, 'student' => 1, 'troll' => -3, 'graffiti' => -3);
    $slashdb->sqlInsert(
    	'reflect_bullet_rating', { 
    	  'comment_id' => $comment_id,
    	  'bullet_id' => $bullet_id,
    	  'bullet_rev' => $bullet_rev,
    	  'rating' => $rating,
    	  'score' => %scores->{$rating},
    	  'user_id' => $user_info->{id}
    	}
    );
	}
	
	my ($total_count, $total_score) = $slashdb->sqlSelect( 
		'count(score), sum(score)', 
		'reflect_bullet_rating', 
		"bullet_id=$bullet_id"
	);
	
	my $score = 0;
	if ( $total_count > 0 ) {
	  # TODO: combine these SQL calls...
  	$score = $total_score / $total_count;
	  $slashdb->sqlUpdate(
	    'reflect_bullet_revision',
	    {'score' => $score},
	    "bullet_id=$bullet_id AND active=1"
	  );  	
  	if($total_count >= 3 && $score < 0) {
  	  $slashdb->sqlUpdate(
  	    'reflect_bullet_revision',
  	    {'active' => 0},
  	    "bullet_id=$bullet_id AND active=1"
  	  );
  	}
	}
		
	return "{\"updated_score\":$score}";
	
}

#######################
## API for Responses ##
#######################

sub create_response {
	my($comment_id, $bullet_id, $text, $signal) = @_;
	my $user_info = __get_user_info();
	my $slashdb = getCurrentDB();	
		
	#server side permission check for this operation...
	my $commenter = $slashdb->sqlSelect('uid', 'comments', "cid = $comment_id");
	if($commenter != $user_info->{id}) {
	  return '';
	}
	
	my $response_params = { 
		'comment_id' => $comment_id,
		'bullet_id' => $bullet_id
	};
	
	$slashdb->sqlInsert(
		'reflect_response',
		$response_params
	);
	my $response_id = $slashdb->getLastInsertId();
	
	my $response_revision_params = {
		'comment_id' => $comment_id,
		'bullet_id' => $bullet_id,
		'response_id' => $response_id,
		'txt' => strip_nohtml($text),
		'user' => $user_info->{name},
		'user_id' => $user_info->{id},
		'signal' => $signal,
		'active' => 1
	};
	$slashdb->sqlInsert(
		'reflect_response_revision',
		$response_revision_params
	);
	my $response_rev_id = $slashdb->getLastInsertId();
	my $name = $user_info->{name};	 
	return "{\"insert_id\":$response_id,\"u\":\"$name\",\"rev_id\":$response_rev_id,\"sig\":$signal}";
	
}

sub update_response {
	my($comment_id, $bullet_id, $response_id, $text, $signal ) = @_;
	my $user_info = __get_user_info();
	my $slashdb = getCurrentDB();	
	
	#server side permission check for this operation...
	my $responder = $slashdb->sqlSelect(
	  'user_id', 'reflect_response_revision', 
	  "response_id = $response_id AND active = 1");
	if($responder != $user_info->{id}) {
	  return '';
	}
	
	$slashdb->sqlUpdate(
		'reflect_response_revision',
		{'active' => 0},
		'response_id=' . $response_id
	);
	
	my $response_revision_params = {
		'comment_id' => $comment_id,
		'bullet_id' => $bullet_id,
		'response_id' => $response_id,
		'txt' => strip_nohtml($text),
		'user' => $user_info->{name},
		'user_id' => $user_info->{id},
		'signal' => $signal,
		'active' => 1
	};	
	$slashdb->sqlInsert(
		'reflect_response_revision',
		$response_revision_params
	);
	my $response_rev_id = $slashdb->getLastInsertId();

	my $name = $user_info->{name};	 
	return "{\"insert_id\":$response_id,\"u\":\"$name\",\"rev_id\":$response_rev_id,\"sig\":$signal}";
		 	
}

sub delete_response {
	my ($response_id) = @_;
	my $slashdb = getCurrentDB();		
	my $user_info = __get_user_info();
	
	#server side permission check for this operation...
	my $responder = $slashdb->sqlSelect(
	  'user_id', 'reflect_response_revision', 
	  "response_id = $response_id AND active = 1");
	if($responder != $user_info->{id}) {
	  return '';
	}
		
	$slashdb->sqlUpdate(
		'reflect_response_revision',
		{'active' => 0},
		'response_id=' . $response_id
	);
	return "{}";
}


createEnvironment();
main();
1;