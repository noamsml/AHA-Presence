net = require("net")
event = require("events")
http = require("http")
fs = require("fs")
mongo = require("mongodb/lib/mongodb")
config = require("./config")


if (typeof(config.channel) == "string")
{
	config.channel = [config.channel];
}

checkins = Object()


 function treatName(name)
{
		return name.replace(/\|.*/, "").replace(/[_`.]+$/, "")
}


function getdb() {
	return  new mongo.Db('ircbot', new mongo.Server(config.db_host, config.db_port))
}

function parse_data (line) {
	//console.log(line);
	var from_r, sep_r, endsep_r;
	var temp_parse,splitval,spare=null;
	var fromparse;
	var rval = {from: "", fromusr: "", fromhost: "", args:[]};
	var i = 0;
	
	from_r = /^:([^! ]*)(!([^@ ]*)@([^ ]*))?$/
	sep_r = /[ ]+/ //for now
	endsep_r=/[ ]+:/
	
	if ((temp_parse = endsep_r.exec(line)))
	{
		spare = line.substring(temp_parse.index + temp_parse[0].length);
		line = line.substring(0, temp_parse.index);
	}
	
	splitval = line.split(sep_r)
	if ((fromparse = from_r.exec(splitval[0])) != null)
	{
		rval.from = fromparse[1];
		rval.fromusr = fromparse[3];
		rval.fromhost = fromparse[4];
		i++;
	}
	
	rval.cmd = splitval[i].toUpperCase();
	i++;
	for (;i<splitval.length;i++)
	{	
		rval.args.push(splitval[i]);
	}
	
	if (spare) { rval.args.push(spare); };
	
	return rval;
}

function NetReader() {
	this.sock = new net.Stream();
	this.data = "";
	this.host = "";
	var self = this;
	this.sock.setEncoding("utf8");
	this.connect = function(port,host) {
		this.sock.on("data", function (data) { 
			var lines = data.split(/\r?\n/);
			this.data= lines.pop();
			self.emit("lines", lines);
		});
		this.host=host;
		this.sock.connect(port, host);
		
	}
	this.write = function(data)
	{
		console.log(">>" + this.host + "<< " + data);
		this.sock.write(data);
	}
}

NetReader.prototype = new event.EventEmitter();




function run_handler(obj,port, host)
{
	var conn = new NetReader();
	conn.on("lines", function (lines) { for (var i=0;i<lines.length;i++) {
			console.log("<<"+host+">> " + lines[i]);
			obj.handle(parse_data(lines[i]), conn); 
		}
	}
	);
	conn.sock.on("connect", function(sock) { obj.onconn(conn); });
	conn.connect(port, host);
}

 var pad_two = function(n) {
        return (n < 10 ? '0' : '') + n;
    };
    
var date_ish = function (d) {
	return pad_two(d.getMonth()+1)+ "/" +pad_two(d.getDate()) + " " + pad_two(d.getHours()) + ":" + pad_two(d.getMinutes());
}

handler = { handle : function (pline, conn) { 
		var parse;
		switch (pline.cmd) {
			case "PING":
				conn.write("PONG :" + pline.args[0] + "\n");
				break;
			case "PRIVMSG":
				pline.args[1] = pline.args[1].trim()
				if (/^(@way|@gone)$/.test(pline.args[1]))
				{
					var name = treatName(pline.from)
					var db = getdb()
					
						db.open( function(err,db) { db.collection("checkins", function(err, col) { 
							col.remove( {'name':name}, function(err, none) {})
						}) })	
					
					
				}
				else if ((parse = /^([@][^ @<>&,.!]*|[2][A-Za-z][^ @<>&,.!]+) *(.*)/.exec(pline.args[1])) != null)
				{
					var name = treatName(pline.from)
					var db = getdb()
					var obj = {'name': name, 'date' : new Date(), 'location' : parse[1]}
					var checkmsg = parse[2].trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
					if (checkmsg != "") obj.checkmsg = checkmsg
					db.open( function(err,db) { db.collection("checkins", function(err, col) { 
							col.update({ 'name' : name }, 
								obj , {'upsert' :  true},
								function (err, none) {})
						}) })
				}
				else if ((parse = /join (#[^ ]+)/i.exec(pline.args[1])))
				{
					if (parse[1].indexOf(config.channel) != -1)
						conn.write("JOIN " + parse[1] + "\n");
				}
				break
		}
	},
	onconn: function (conn) {
		
		conn.write("NICK " + config.nick + " \nUSER taft taft taft :Howard Taft\n");
		for (c in config.channel)
			conn.write("JOIN " + config.channel[c] + "\n");
	}
}
	
	
	
http.createServer(function (req, res) {
	
	  //TODO: Find a way to delete old ones
	  var db=getdb();
	  if (req.method == "GET") {
	  if (req.url == "/old" || req.url == "/json")
	  {	  
		  db.open( function(err, db)
		  {
				console.log("1 alligator")
				db.collection("checkins", function(err, col)
				{	
					console.log("2 alligator")
					var sdate = new Date((new Date()).getTime() - 1000 * 3600 * 6)
					col.find({'date' : {'$gte' : sdate} }, {'sort' : 'location'}, function(err, cur)
					{
						console.log("3 alligator")
						var checkins = cur.toArray(function(err, checkins) {
						console.log("4 alligator")	
						
							if (req.url == "/old")
							{
							  res.writeHead(200, {'Content-Type': 'text/html'});
							  res.write("<html><head><title>@HA Presence!</title>")
							  res.write("<link rel='stylesheet' href='http://khazaei.net/~noamsml/aha.css' />")
							  res.write("</head><body>")
							  res.write("<h1>@HA Presence!</h1><table><thead><td>Name</td><td>Last Checkin</td><td>At</td></thead>")
							  for (var checknum in checkins)
							  {
								  var check = checkins[checknum]
								  console.log(check)
								  res.write("<tr><td>"+check.name+"</td><td>"+ date_ish(new Date(check.date)) + "</td><td>" + check.location + "</td></tr>")
							  }
							  res.end("</table></body></html>")
							}
							else if (req.url == "/json")
							{
							  res.writeHead(200, {'Content-Type': 'application/json'});
							  res.end(JSON.stringify(checkins));
							}
						
						})
					})
				})
			})
		}
		else if (req.url == "/")
		{
		  res.writeHead(200, {'Content-Type': 'text/html'});
		  res.end(fs.readFileSync(config.pubhtml_path + "index.html", "utf8"));
		}
		
		else if ((parse = /static\/([^.][^ \/]*)/i.exec(req.url)))
		{
		  res.writeHead(200, {'Content-Type': 'text/html'});
		  try {
			res.end(fs.readFileSync(config.pubhtml_path + parse[1], "utf8"));
		  }
		  catch (err) {
			 res.end("404 NOT FOUND :(")
		  }
		}
		else
		{
		  res.writeHead(404, {'Content-Type': 'text/plain'});
		  res.end(":( NOOOO THEY BE REQUESTIN MAH WEBPAGE");
		}
	}
	else
	{
		res.writeHead(404, {'Content-Type': 'text/plain'});
		res.end(":(");
	}
					
}).listen(config.httport, "");
run_handler(handler, config.port, config.server);


//run_handler(handler, 1234, "localhost");
