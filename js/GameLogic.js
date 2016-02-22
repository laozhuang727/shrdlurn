"use strict"
// captures the game state
String.prototype._format = function(placeholders) {
    var s = this;
    for(var propertyName in placeholders) {
        var re = new RegExp('{' + propertyName + '}', 'gm');
        s = s.replace(re, placeholders[propertyName]);
    }    
    return s;
};

function GameState() {
    // the walls, just json strings
    this.currentWall = "[[]]";
    this.targetWall = "[[]]";
    this.listWalls = [];
    
    this.NBest = []; // current answer list returned by sempre
    this.NBestInd = 0;
    this.sessionId = "deadbeef";
    
    this.query = "";
    this.numQueries = 0;

    this.taskind = 0;
    this.successCounts = {}
    
    this.noAnswer = function() {
	return this.NBest==undefined || this.NBest.length == 0 || this.NBest.length == undefined
    }
    this.noQuery = function() {
	return this.query==undefined || this.query.trim().length==0
    }
    this.resetNBest = function() {
	this.NBest = []; // current answer list returned by sempre
	this.NBestInd = 0;
    }
    
    this.basicStatusMessage = function (mode) {
	var def =  ""
	if (this.query) {
	    
	}
	if (mode == undefined)
	    return def;
	else if (mode == "exec") {
	    if (this.query.trim() == "")
		return "??"
	    return "executed: " + this.query
	} else if (mode == "accept") {
	    if (this.noAnswer())
		return "nothing to accept"
	    return this.query + " # " + (this.NBestInd+1) + ": ✓"
	}
	else
	    return mode + ', ' + def;
    }
    
    this.saveGameState = function() {
    }

    this.loadGameState = function() {
    }

    this.setCurrentWall = function() {
	if (this.NBest.length>0)
	    this.currentWall = this.NBest[this.NBestInd].value;
	else
	    this.currentWall = '[[]]';
    }
    
    this.getCurrentWall = function() {
	if ( this.currentWall && this.currentWall.length > 0)
	{
	    return this.currentWall;
	}
	return '[[]]';
    }
    this.nextIfPossible = function() {
	if (this.noAnswer()) return false;
	if (this.NBestInd < this.NBest.length-1) {
	    this.NBestInd++;
	    this.currentWall = this.NBest[this.NBestInd].value;
	    return true;
	}
	return false;
    }
    this.prevIfPossible = function() {
	if (this.noAnswer()) return false;
	if (this.NBestInd > 0) {
	    this.NBestInd--;
	    this.currentWall = this.NBest[this.NBestInd].value;
	    return true;
	}
	return false;
    }

    this.getStandardQuery = function() {
	return {q: this.query, sessionId:this.sessionId}
    }

    this.getSuccessCount = function(levelid) {
	if (this.successCounts[levelid] == undefined)
	    return 0;
	return this.successCounts[levelid]
    }
    this.incrementSuccessCount = function(levelid) {
	if (this.successCounts[levelid] == undefined)
	    this.successCounts[levelid] = 1;
	else {
	    this.successCounts[levelid] ++;
	}
    }
}

var GS = new GameState();

function updateCanvas(gs) {
    var PSMain = PS.Main;
    var walls = [];

    var wlen = gs.listWalls.length;
    var maxWalls = configs.levels[gs.taskind].maxSteps;
    
    // cut
    if (wlen <= maxWalls) {
	walls = walls.concat(gs.listWalls)
    } else { // shift left when the sequences gets too long
	walls = walls.concat(gs.listWalls.slice(wlen - maxWalls));
    }
    
    walls.push(gs.getCurrentWall())
	
    for (var i=0; i < maxWalls- wlen; i++)
	walls.push('[[]]');
    // pad
    walls.push(gs.targetWall);
    PSMain.renderJSON('['+walls.join(',')+']')();
}

function newWall(gs) {
    var wallcommand = "(execute (call edu.stanford.nlp.sempre.cubeworld.StacksWorld.getLevel (string {task})))"
	._format({task: configs.levels[gs.taskind].id}); // attach arguments here!
    var cmds = {q:wallcommand, sessionId:gs.sessionId};
    gs.resetNBest();
    gs.query = '';
    gs.listWalls = [];
    
    sempre.sempreQuery(cmds, function (jsonstr) {
	if (jsonstr == "ERR_CONNECTION_REFUSED") {
	    updateStatus("our server might be down...")
	    return
	}
	var jsresp = JSON.parse(jsonstr)['lines'];
	var walls = jsresp[0].replace(/\(string /g, '').replace(/\)|\s/g, '').split('|');
	gs.listWalls.push(walls[0]);
	gs.targetWall = walls[1];
	gs.setCurrentWall();
	updateCanvas(gs);
    })
}


var GameAction = {
    _candidates: function(gs) {
	var cmds = {q:gs.query, sessionId:gs.sessionId};
	sempre.sempreQuery(cmds , function(jsonstr) {
	    var formval = sempre.parseSEMPRE(jsonstr);
	    if (formval == undefined) {
		console.log('undefined answer from sempre')
		return;
	    } else {
		gs.NBestInd = 0;
		gs.NBest = formval;
		gs.setCurrentWall();
	    }
	    if (configs.debugMode)
		writeSemAns(gs);
	    updateCanvas(gs);
	    GameAction.checkAnswer(gs);
	});
    },

    commitandcandidates: function(gs) {
	if (!gs.noAnswer()) {
	    console.log("use current answer, accept, and clear Nbest");
	    updateStatus("accepted previous wall. use ↑ and ↓ to scroll.");
	    sempre.sempreQuery({q: gs.query, accept:gs.NBestInd, sessionId:gs.sessionId}, function(){})
	    gs.listWalls.push(gs.currentWall);
	    gs.resetNBest();
	    gs.setCurrentWall();
	} else {
	    updateStatus("use ↑ and ↓ to scroll, ⎌ to undo, and ✓ to express approval");
	}
	
	if (configs.hardMaxSteps
	    && gs.listWalls.length > configs.levels[gs.taskind].maxSteps) {
	    updateStatus("using too many steps, try ⎌.");
	    return;
	}
	var contextcommand = "(context (graph NaiveKnowledgeGraph ((string {wall}) (name b) (name c))))"
	    ._format({wall:gs.listWalls[gs.listWalls.length-1]}); // attach arguments here!
	var cmds = {q:contextcommand, sessionId:gs.sessionId};
	sempre.sempreQuery(cmds , function(jsonrespcontext) {
		GameAction._candidates(gs);
	});	
    },
    undo: function(gs) {
	if (gs.noAnswer()) { // not in scrolling mode
	    gs.resetNBest();
	    gs.setCurrentWall();
	    if ( gs.listWalls.length == 1) {
		newWall(gs)
		updateStatus("⎌: already at the start, got a new wall instead.")
	    } else {
		// else pop the top and set it as context
		gs.listWalls.pop();
		if ( gs.listWalls.length == 1)
		    updateStatus("⎌: undo again for new instance.")
		else
		    updateStatus("⎌: at the previous wall")
		GameAction.checkAnswer(gs)
		updateCanvas(gs);
	    }
	} else { // scrolling
	    gs.resetNBest();
	    gs.setCurrentWall();
	    updateStatus("⎌: cleared current choices")
	    updateCanvas(gs);
	}
    },
    random: function(gs) {
	gs.resetNBest();
	gs.setCurrentWall();
	newWall(gs)
	updateStatus("another example of this level.")
    },
    nextLevel: function(gs) { // either the next random instance, or the next new level
	gs.resetNBest();
	gs.setCurrentWall();
	gs.incrementSuccessCount( configs.levels[gs.taskind].id );
	showNextButton(false);
	var curSucc = gs.getSuccessCount( configs.levels[gs.taskind].id );
	var minSucc = configs.levels[gs.taskind].minSuccess;
	if (gs.getSuccessCount( configs.levels[gs.taskind].id ) < configs.levels[gs.taskind].minSuccess) {
	    newWall(gs);
	    updateStatus("solve this puzzle " + (minSucc - curSucc) + " more times to advance.");
	    popTasks();
	    return false;
	}
	    
	if (gs.taskind+1 < configs.levels.length) {
	    gs.taskind++;
	    newWall(gs);
	    updateStatus("the new level is: {levelname}"._format({levelname:configs.levels[gs.taskind].name}))
	    popTasks();
	    return true;
	} else {
	    updateStatus("already at the last level.");
	    popTasks();
	    return false;
	}
	
    },
    prev: function(gs) {
	if (gs.noAnswer()) {
	    updateStatus("↑: can't scroll, give a command");
	    return;
	}
	if (gs.prevIfPossible()) {
	    updateCanvas(gs)
	    updateStatus("↑: showing the previous one")
	    GameAction.checkAnswer(gs)
	} else {
	    updateStatus("↑: already showing the first one")
	}
    },
    next: function(gs) {
	if (gs.noAnswer()) {
	    updateStatus("↓: can't scroll, give a command");
	    return;
	}
	if (GS.nextIfPossible()) {
	    updateCanvas(gs)
	    updateStatus("↓: showing the next one")
	    GameAction.checkAnswer(gs)
	} else {
	    updateStatus("↓: already showing the last one")
	}
    },
    accept: function(gs) {
	if (gs.noAnswer()) {
	    updateStatus("✓: can't accept, give a command first");
	    return;
	}
	sempre.sempreQuery({q: gs.query, accept:gs.NBestInd, sessionId:gs.sessionId}, function(){})
	//updateCanvas(GS)
	updateStatus("✓: confirmed (#{accept}/{length})"
		     ._format({accept:gs.NBestInd, length:gs.NBest.length}))
    },
    checkAnswer: function(gs) {
	if (gs.currentWall == gs.targetWall) {
	    showNextButton(true);
	    updateStatus("shift-enter or ✓ if this is what you want");
	    return true;
	} else {
	    showNextButton(false); return false;
	}
    }
};
//*************** DOM stuff

function showNextButton(show) {
    if (show) {
	document.getElementById("message").style.visibility = "visible";
    } else {
	document.getElementById("message").style.visibility = "hidden";
    }
} 
function logh(strlog) {document.getElementById("history").innerHTML += strlog; }
function updateStatus(strstatus)
{
    document.getElementById("status").innerHTML = strstatus
    
    if (GS.query && GS.query.length>0) {
	var stateinfo = "<b>↵: {query}"._format({query:GS.query});
	if (!GS.noAnswer()) {
	    stateinfo = "<b>↵: {query} (#{NbestInd}/{Nbestlen})</b>"
		._format({query:GS.query, NbestInd:GS.NBestInd+1, Nbestlen: GS.NBest.length});
		if (configs.debugMode)
		    stateinfo += "\n (formula " + GS.NBest[GS.NBestInd].formula +")";
	}
	document.getElementById("currentcmd").innerHTML = stateinfo;
    }
    else
	document.getElementById("currentcmd").innerHTML = "<b>no command to run</b>";
}


function writeSemAns(gs) {
    document.getElementById("sempreret").innerHTML = ''
    var formval = gs.NBest;
    for (i in formval)
	document.getElementById("sempreret").innerHTML +=
    (1+parseInt(i)) + ' : (prob={prob},score={score}): {formula}'._format(formval[i]) +
	'<br/>';
}

// DOM functions, and events
// consider retriving this list from sempre
function popTasks() {
    var puzzles = configs.puzzles;
    var ps = document.getElementById("tasks");
    ps.options.length = 0;
    for (var l in configs.levels) {
	var p1 = document.createElement("option");
	var numSucc = GS.getSuccessCount(configs.levels[l].id);
	var minSucc = configs.levels[l].minSuccess;
	var solved = numSucc >= minSucc? ' ✓' : '';
	p1.text =  (parseInt(l)+1) + " " + configs.levels[l].name
	    + " ({numSucc}/{minSucc})" 
	    ._format({numSucc:numSucc, minSucc:minSucc}) + solved
	p1.id = "level-" + configs.levels[l].id;
	
	ps.appendChild(p1);
    }
    ps.selectedIndex = GS.taskind;
}

document.getElementById("tasks").onchange = function() {
    var t = document.getElementById("tasks");
    var taskstr = t.options[t.selectedIndex].name;
    GS.taskind = t.selectedIndex;
    newWall(GS);
    updateStatus("selected level {task}"._format({task:taskstr}));
};

function runCurrentQuery(gs) {
    var querystr = document.getElementById("maintextarea").value.trim()
    document.getElementById("maintextarea").value = ''

    if (querystr.length>0) {
	gs.numQueries++; 
	logh(gs.numQueries + ' ' + querystr + '; ')
	gs.query = querystr;
	GameAction.commitandcandidates(gs);
    } else {
	updateStatus("there is no command");
    }
}
document.getElementById("dobutton").onclick = function() {
    runCurrentQuery(GS);
};
document.getElementById("undobutton").onclick = function() {
    GameAction.undo(GS);
};
document.getElementById("prevbutton").onclick = function() {
    GameAction.prev(GS);
};
document.getElementById("nextbutton").onclick = function() {
    GameAction.next(GS);
};
document.getElementById("acceptbutton").onclick = function() {
    GameAction.accept(GS);
    if (GameAction.checkAnswer(GS))
	    GameAction.nextLevel(GS)
};

document.getElementById("solvedandnext").onclick = function() {
    GameAction.accept(GS);
    GameAction.nextLevel(GS);
};

var Hotkeys = {
    ENTER: 13,
    LEFT: 37,
    RIGHT: 39,
    UP: 38,
    DOWN: 40,
    Z : 90
};

document.getElementById("maintextarea").onkeydown = function(e) {
    if (e.keyCode == Hotkeys.UP) {
	GameAction.prev(GS);
	return false;
    } else if (e.keyCode == Hotkeys.DOWN) {
	GameAction.next(GS);
	return false;
    }
}
document.onkeydown = function(e) {
    if (e.keyCode == Hotkeys.ENTER && e.shiftKey ) {
	GameAction.accept(GS);
	if (GameAction.checkAnswer(GS))
	    GameAction.nextLevel(GS)
	return false;
    } else if (e.keyCode == Hotkeys.ENTER && !e.shiftKey) {
	runCurrentQuery(GS); return false;
    } else if (e.keyCode == Hotkeys.Z && (e.ctrlKey || e.metaKey)) {
	GameAction.undo(GS); return false;
    } return true;
};

popTasks();
newWall(GS);
document.getElementById("maintextarea").focus()