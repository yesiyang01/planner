var express = require('express')
var mongoose = require('mongoose')
var router = express.Router()

// Valid parameters
var PARAMS = [
  "code", "name", "description", "division", "department", "prerequisite",
  "exclusion", "level", "breadths", "campus", "term", "instructors",
  "location", "size", "rating"
]

// What the parameters map to in MongoDB
var KEYMAP = {
  "code": "code",
  "name": "name",
  "description": "description",
  "division": "division",
  "department": "department",
  "prerequisite": "prerequisites",
  "exclusions": "exclusions",
  "level": "course_level",
  "breadths": "breadths",
  "campus": "campus",
  "term": "term",
  "apsc_elec": "apsc_elec",
  "meeting_code": "meeting_sections.code",
  "instructors": "meeting_sections.instructors",
  "day": "meeting_sections.times.day",
  "start": "meeting_sections.times.start",
  "end": "meeting_sections.times.end",
  "location": "meeting_sections.times.location",
}

// The heavenly schema, mapping what our database holds data like
var courseSchema = new mongoose.Schema({
  course_id: String,
  code: String,
  name: String,
  description: String,
  division: String,
  prerequisites: String,
  exlusions: String,
  course_level: Number,
  breadths: [Number],
  campus: String,
  term: String,
  apsc_elec: String,
  meeting_sections: [new mongoose.Schema({
    code: String,
    instructors: [String],
    times: [new mongoose.Schema({
      day: String,
      start: String,
      end: String,
      location: String
    })],
    class_size: Number
    //class_enrolment: Number
  })]
})

var courses = mongoose.model("courses", courseSchema)

// When searching for exact ID
router.get('/:id', function(req, res) {
  if (req.params.id != undefined && req.params.id != "") {
    var search = {}
    search['course_id'] = req.params.id;
    courses.find(search, function(err, docs) {
      res.json(docs)
    })
  } else {
    res.send(403)
  }
})

// When searching with the parameters
router.get('/', function(req, res) {

  // For tracking time it takes to complete a request
  var start = new Date()

  var search = { $and: [] }
  var query = req.query
  var clean = true
  var queries = 0

  console.log(query)

  for (var key in query) {

    key = key.toLowerCase()

    if (PARAMS.indexOf(key) > -1 && query[key].length > 0) {

      // Format the query to a MongoDB friendly search object
      var q = parseQuery(key, query[key])

      if (q.isValid) {
        queries++
        search.$and = search.$and.concat(q.query)
      } else {
        res.status(403).end()
        return
      }

    } else {
      res.status(403).end()
      return
    }

  }

  // Only process a query if it has more than query
  if (queries > 0) {
    console.log(JSON.stringify(search))
    courses.find(search, function(err, docs) {
      console.log("Done: " + Math.abs(new Date() - start) + "ms")
      res.json(docs)
    })
  } else {
    res.status(403).end()
    return
  }

})

var parseQuery = function(key, query) {

  // Response format
  var response = {
    isValid: true,
    query: {}
  }

  // Split on the AND operator
  parts = query.split(",")
  for(var x = 0; x < parts.length; x++) {

    // Split on the OR operator
    parts[x] = { $or: parts[x].split("/") }
    for (var y = 0; y < parts[x].$or.length; y++) {

      //Format the specific part of the query
      var part = formatPart(key, parts[x].$or[y])

      if(part.isValid) {
        parts[x].$or[y] = part.query
      } else {
        response.isValid = false
        return response
      }

    }
  }

  response.query = parts
  return response

}

var formatPart = function(key, part) {

  // Response format
  var response = {
    isValid: true,
    query: {}
  }


  // Checking if the start of the segment is an operator (-, >, <, .>, .<)
  if(part.indexOf("-") === 0) {
    // Negation
    part = {
      operator: "-",
      value: part.substring(1)
    }
  } else if(part.indexOf(">") === 0) {
    part = {
      operator: ">",
      value: part.substring(1)
    }
  } else if(part.indexOf("<") === 0) {
    part = {
      operator: "<",
      value: part.substring(1)
    }
  } else if(part.indexOf(".>") === 0) {
    part = {
      operator: ".>",
      value: part.substring(2)
    }
  } else if(part.indexOf(".<") === 0) {
    part = {
      operator: ".<",
      value: part.substring(2)
    }
  } else {
    part = {
      operator: undefined,
      value: part
    }
  }

  /*
    WE STILL GOTTA VALIDATE THE QUERY HERE, WOW I KEEP PUTTING IT OFF.

    Basically, if the query is valid, we're good to go. If it isn't, set
    response.isValid to false and return the response object.
  */

  if (["breadths", "level", "class_size", "class_enrolment"].indexOf(key) > -1) {
    // Integers and arrays of integers (mongo treats them the same)

    part.value = parseInt(part.value)
    if(part.operator == "-") {
      response.query[KEYMAP[key]] = { $ne: part.value }
    } else if(part.operator == ">") {
      response.query[KEYMAP[key]] = { $gt: part.value }
    } else if(part.operator == "<") {
      response.query[KEYMAP[key]] = { $lt: part.value }
    } else if(part.operator == ".>") {
      response.query[KEYMAP[key]] = { $gte: part.value }
    } else if(part.operator == ".<") {
      response.query[KEYMAP[key]] = { $lte: part.value }
    } else {
      // Assume equality if no operator
      response.query[KEYMAP[key]] = part.value
    }

  } else if(["start_time", "end_time", "duration"].indexOf(key) > -1) {
    // Time related things



  } else if(key == "instructors") {
    // Array of strings

    if(part.operator == "-") {
      response.query[KEYMAP[key]] = { $not: {
        $elemMatch: { $regex: "(?i).*" + part.value + ".*" }
      } }
    } else {
      response.query[KEYMAP[key]] = {
        $elemMatch: { $regex: "(?i).*" + part.value + ".*" }
      }
    }

  } else {
    // Just your average string

    if(part.operator == "-") {
      response.query[KEYMAP[key]] = {
        $regex: "^((?!" + part.value + ").)*$",
        $options: 'i'
      }
    } else {
      response.query[KEYMAP[key]] = { $regex: "(?i).*" + part.value + ".*" }
    }

  }

  return response

}

module.exports = router
