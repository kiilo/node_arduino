HOST = null; // localhost
PORT = 8001;
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



var fu = require("./fu"),
    sys = require("sys"),
    url = require("url"),
    qs = require("querystring");
    net = require("net");
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
        sys.puts("<" + nick + "> " + text);
        break;
      case "join":
        sys.puts(nick + " join");
        break;
      case "part":
        sys.puts(nick + " part");
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

fu.listen(Number(process.env.PORT || PORT), HOST);

fu.get("/", fu.staticHandler("index.html"));
fu.get("/style.css", fu.staticHandler("style.css"));
fu.get("/client.js", fu.staticHandler("client.js"));
fu.get("/jquery-1.2.6.min.js", fu.staticHandler("jquery-1.2.6.min.js"));


fu.get("/who", function (req, res) {
  var nicks = [];
  for (var id in sessions) {
    if (!sessions.hasOwnProperty(id)) continue;
    var session = sessions[id];
    nicks.push(session.nick);
  }
  res.simpleJSON(200, { nicks: nicks
                      , rss: mem.rss
                      });
});

fu.get("/join", function (req, res) {
  var nick = qs.parse(url.parse(req.url).query).nick;
  if (nick == null || nick.length == 0) {
    res.simpleJSON(400, {error: "Bad nick."});
    return;
  }
  var session = createSession(nick);
  if (session == null) {
    res.simpleJSON(400, {error: "Nick in use"});
    return;
  }

  //sys.puts("connection: " + nick + "@" + res.connection.remoteAddress);

  channel.appendMessage(session.nick, "join");
  res.simpleJSON(200, { id: session.id
                      , nick: session.nick
                      , rss: mem.rss
                      , starttime: starttime
                      });
});

fu.get("/part", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  var session;
  if (id && sessions[id]) {
    session = sessions[id];
    session.destroy();
  }
  res.simpleJSON(200, { rss: mem.rss });
});

fu.get("/recv", function (req, res) {
  if (!qs.parse(url.parse(req.url).query).since) {
    res.simpleJSON(400, { error: "Must supply since parameter" });
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
    res.simpleJSON(200, { messages: messages, rss: mem.rss });
  });
});

fu.get("/send", function (req, res) {
  var id = qs.parse(url.parse(req.url).query).id;
  var text = qs.parse(url.parse(req.url).query).text;

  var session = sessions[id];
  if (!session || !text) {
    res.simpleJSON(400, { error: "No such session id" });
    return;
  }

  session.poke();

  channel.appendMessage(session.nick, "msg", text);
  for (var i = 0; i < tcpGuests.length; i++) { 	
	try {
		tcpGuests[i].write(text+"\n");
		console.log("send to: " + i);
	}
	catch (eee) {
		console.log("removed socket " + i);
    		tcpGuest = tcpGuests.splice(i,1);
        }
  }
  
  res.simpleJSON(200, { rss: mem.rss });
});

//tcp socket server
var tcpServer = net.createServer(function (socket) {
  socket.setEncoding("utf8")
  console.log('tcp server running on port' + TCPPORT);
  var my_carrier = carrier.carry(socket);
//  	my_carrier.on('line',  function(line) {
//    	console.log('got one line: ' + line);
//  });
});

tcpServer.on('connection',function(socket){
    socket.write(':connect\r\n');
    console.log('num of connections on port ' + TCPPORT + ': ' + tcpServer.connections);
    ArduinoNr++;
    var ArduinoSession = createSession("arduino"+ ArduinoNr);
    channel.appendMessage("arduino"+ ArduinoNr,"join");
    tcpGuests.push(socket);
    var my_carrier = carrier.carry(socket);

    my_carrier.on('line',  function(line) {
         channel.appendMessage(ArduinoSession.nick, 'msg', line);
	// ok write also to the TCP socket (arduino)	 
	for (var i = 0; i < tcpGuests.length; i++) {
		if (tcpGuests[i] === socket) {
			//console.log("bingo");
		}
		else { 	
			try {
				tcpGuests[i].write(line+"\n");
				//console.log("send to: " + i);
			}
			catch (eee) {
				console.log("this socket " + i);
    				tcpGuest = tcpGuests.splice(i,1);
			}
		}
	}
    });


    //socket.on('data',function(data){
        //console.log('received on tcp socket:' + data);
        //socket.write('OK\n');
        
        //send data to guest socket.io chat server
	//ArduinoSession.poke();
        //channel.appendMessage(ArduinoSession.nick, 'msg', data);	    
    //});

    socket.on('close',function(socket){
	channel.appendMessage(ArduinoSession.nick, "part");    	
    	ArduinoSession.destroy(); //delete Arduino from the list
    	for (var i = 0; i < tcpGuests.length; i++) {
		//console.log(tcpGuests[i]._handle);
		if (tcpGuests[i]._handle == null) {
			console.log("REMOVE this socket " + i);
			tcpGuest = tcpGuests.splice(i,1);
		}
    	}
        console.log('num of connections on port ' + TCPPORT + ': ' + tcpServer.connections);
     });

});




tcpServer.listen(TCPPORT);
