HOST = null; // localhost
PORT = 8080;
TCPPORT = 7000;
tcpGuests = [];

// when the daemon started
var starttime = (new Date()).getTime();

var ArduinoNr = 0;

var mem = process.memoryUsage();
// every 10 seconds poll for the memory.
setInterval(function () {
  mem = process.memoryUsage();
}, 10*1000);



var express = require("express"),
    sys = require("util"),
    url = require("url"),
    qs = require("querystring"),
    net = require("net"),
    carrier = require('carrier');

var MESSAGE_BACKLOG = 200,
    SESSION_TIMEOUT = 60 * 1000;

var channel = new function () {
  var messages = [],
      callbacks = [];

  this.appendMessage = function (nick, type, text) {
    var m = { nick: nick
            , type: type // "msg", "join", "part"
            , text: text
            , timestamp: (new Date()).getTime()
            };

    switch (type) {
      case "msg":
        sys.log("<" + nick + "> " + text);
        break;
      case "join":
        sys.log(nick + " join");
        break;
      case "part":
        sys.log(nick + " part");
        break;
    }

    messages.push( m );

    while (callbacks.length > 0) {
      callbacks.shift().callback([m]);
    }

    while (messages.length > MESSAGE_BACKLOG)
      messages.shift();
  };

  this.query = function (since, callback) {
    var matching = [];
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i];
      if (message.timestamp > since)
        matching.push(message)
    }

    if (matching.length != 0) {
      callback(matching);
    } else {
      callbacks.push({ timestamp: new Date(), callback: callback });
    }
  };

  // clear old callbacks
  // they can hang around for at most 30 seconds.
  setInterval(function () {
    var now = new Date();
    while (callbacks.length > 0 && now - callbacks[0].timestamp > 30*1000) {
      callbacks.shift().callback([]);
    }
  }, 3000);
};

var sessions = {};

function createSession (nick) {
  if (nick.length > 50) return null;
  if (/[^\w_\-^!]/.exec(nick)) return null;

  for (var i in sessions) {
    var session = sessions[i];
    if (session && session.nick === nick) return null;
  }

  var session = { 
    nick: nick, 
    id: Math.floor(Math.random()*99999999999).toString(),
    timestamp: new Date(),

    poke: function () {
      session.timestamp = new Date();
    },

    destroy: function () {
      channel.appendMessage(session.nick, "part");
      delete sessions[session.id];
    }
  };

  sessions[session.id] = session;
  return session;
}

// interval to kill off old sessions
setInterval(function () {
  var now = new Date();
  for (var id in sessions) {
    if (!sessions.hasOwnProperty(id)) continue;
    var session = sessions[id];

    if (now - session.timestamp > SESSION_TIMEOUT) {
      session.destroy();
    }
  }
}, 1000);

var app = require('express').createServer();

app.get("/who", function (req, res) {
  var nicks = [];
  for (var id in sessions) {
    if (!sessions.hasOwnProperty(id)) continue;
    var session = sessions[id];
    nicks.push(session.nick);
  }
  res.send({ nicks: nicks
                      , rss: mem.rss
                      });
});

app.get("/join", function (req, res) {
  var nick = qs.parse(url.parse(req.url).query).nick;
  if (nick == null || nick.length == 0) {
    res.send({error: "Bad nick."});
    return;
  }
  var session = createSession(nick);
  if (session == null) {
    res.send({error: "Nick in use"});
    return;
  }

  //sys.log("connection: " + nick + "@" + res.connection.remoteAddress);

  channel.appendMessage(session.nick, "join");
  res.send({ id: session.id
                      , nick: session.nick
                      , rss: mem.rss
                      , starttime: starttime
                      });
});

app.get("/part", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  var session;
  if (id && sessions[id]) {
    session = sessions[id];
    session.destroy();
  }
  res.send({ rss: mem.rss });
});

app.get("/recv", function (req, res) {
  if (!qs.parse(url.parse(req.url).query).since) {
    res.send( { error: "Must supply since parameter" });
    return;
  }
  var id = qs.parse(url.parse(req.url).query).id;
  var session;
  if (id && sessions[id]) {
    session = sessions[id];
    session.poke();
  }

  var since = parseInt(qs.parse(url.parse(req.url).query).since, 10);

  channel.query(since, function (messages) {
    if (session) session.poke();
    res.send({ messages: messages, rss: mem.rss });
  });
});

app.get("/send", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  var text = qs.parse(url.parse(req.url).query).text;

  var session = sessions[id];
  if (!session || !text) {
    res.send({ error: "No such session id" });
    return;
  }

  session.poke();

  channel.appendMessage(session.nick, "msg", text);
  for (var i = 0; i < tcpGuests.length; i++) { 	
	try {
		tcpGuests[i].write(text+"\n");
		sys.log("send to: " + i);
	}
	catch (eee) {
		sys.log("removed socket " + i);
    		tcpGuest = tcpGuests.splice(i,1);
        }
  }
  
  res.send({ rss: mem.rss });
});

app.use("/",express.static(__dirname + '/static'));

app.listen(PORT);


//tcp socket server
var tcpServer = net.createServer(function (socket) {
  socket.setEncoding("utf8")
  sys.log('tcp server running on port' + TCPPORT);
  var my_carrier = carrier.carry(socket);
//  	my_carrier.on('line',  function(line) {
//    	sys.log('got one line: ' + line);
//  });
});

tcpServer.on('connection',function(socket){
    socket.write('?\n');
    socket.setTimeout(3000, (function(){
    if (!auth) {
    		socket.write('?\n');
                socket.end('403\n');
                sys.log("timeout for: " + socket.remoteAddress);
                } 
    }) )
    var auth = false;
    var ArduinoSession;
    var my_carrier = carrier.carry(socket);
    

    
     my_carrier.on('line', function (line) {
         if (auth) {
             channel.appendMessage(ArduinoSession.nick, 'msg', line);
             // ok write also to the TCP socket (arduino)	 
             for (var i = 0; i < tcpGuests.length; i++) {
                 if (tcpGuests[i] === socket) {
                     //sys.log("bingo");
                 } else {
                     try {
                         tcpGuests[i].write(line + "\n");
                         //sys.log("send to: " + i);
                     } catch (eee) {
                         sys.log("this socket " + i + " DIED");
                         tcpGuest = tcpGuests.splice(i, 1);
                     }
                 }
             }

         } else {
             if (line == "k BC37ACB390EF2") {
             	 socket.setTimeout(0,(function(){}));
                 sys.log('SUCCESSFUL connection from: ' + socket.remoteAddress + ' : ' + socket.remotePort);
                 ArduinoNr++;
                 ArduinoSession = createSession("arduino" + ArduinoNr);
                 channel.appendMessage("arduino" + ArduinoNr, "join");
                 tcpGuests.push(socket);
                 socket.write('200\n');
                 auth = true;
             } else {
                 sys.log("login failed from: " + socket.remoteAddress + " KEY " + line);
                 socket.write('?\n');
                 socket.end('403\n');
             	}
             }
         });    


    //socket.on('data',function(data){
        //sys.log('received on tcp socket:' + data);
        //socket.write('OK\n');
        
        //send data to guest socket.io chat server
	//ArduinoSession.poke();
        //channel.appendMessage(ArduinoSession.nick, 'msg', data);	    
    //});

    socket.on('close',function(socket){
    	if (auth) {
	channel.appendMessage(ArduinoSession.nick, "part");    	
    	ArduinoSession.destroy(); //delete Arduino from the list
    	for (var i = 0; i < tcpGuests.length; i++) {
		//sys.log(tcpGuests[i]._handle);
		if (tcpGuests[i]._handle == null) {
			sys.log("REMOVE this socket " + i);
			tcpGuest = tcpGuests.splice(i,1);
		}
    	}
    	}
        sys.log('num of connections on port ' + TCPPORT + ': ' + tcpServer.connections);
     });

});




tcpServer.listen(TCPPORT);
