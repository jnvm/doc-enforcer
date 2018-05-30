# doc enforcer

This is a way to _guarantee_ plain, human-readable, deep-linkable descriptions exist in github-compatible READMEs for arrays of strings you provide in one of [3 patterns](#how):
* by [globbing](http://npmjs.org/glob) for js files in your codebase, applying [AST selectors](http://npmjs.org/esquery) to them, and extracting specific [properties](http://npmjs.org/lodash-getpath)
* by executing arbitrary code to return a string array
* by hardcoding a string array directly

Attach these to tests to guarantee documentation, as the check fails until all items are documented.

See [examples](#examples) section below for ideas.

<table><thead><tr><th>
Table of Contents
</th></tr></thead><tbody><tr><td><ul>
    <li><a href="#why">Why</a></li>
    <li><a href="#how">How</a></li>
    <li><a href="#examples">Examples</a></li>
        <ul>
        <li><a href="#moduleexports">module.exports</a></li>
        <li><a href="#a-folder-structure">A Folder Structure</a></li>
        <li><a href="#a-csv">A CSV</a></li>
        <li><a href="#a-database-schema">A Database Schema</a></li>
        <li><a href="#a-fancier-database-schema">A Fancier Database Schema</a></li>
        </ul>
    <li><a href="#contra">Contra</a></li>
    <li><a href="#references">References</a></li>
</ul></td></tr></tbody></table>

## Why

* eliminating [folklore](https://en.wikipedia.org/wiki/Folklore) and [oral tradition](https://en.wikipedia.org/wiki/Oral_tradition) surrounding code
* guaranteeing support for the next dev (not you or anyone else in your current team)
* minimizing the [bus factor](https://en.wikipedia.org/wiki/Bus_factor)
* keeping things written down
* [Unlike Socrates](https://www.youtube.com/watch?v=djkWO_gScng&t=9s), you think the [relative](https://www.youtube.com/watch?v=2tcOi9a3-B0&t=51s) benefit of writing something down outweighs the costs

## How

```javascript
require('doc-enforcer')([ //a single function exported
	//which you supply an array of objects:
{	// each object often called a "pattern"
	name:""         ,// what to title this doc section
	markdownPath:"" ,// which md file this doc should go in
		// note these sections are <!--delimited-->, so N patterns
		// may exist in one file, in any order.
		// Just don't add anything except the requested
		// descriptions inside the delimiters, 
		// or they will disappear on rebuild.
	verbose:true    ,// (default: true)
		// true = log out success & fail; false = only fails
	optional:false  ,// (default: false)
		// false = throw on missing doc; true = don't

	// extract a string [] 1 of 3 ways:
		// 1) either from js files by globbing, ASTing, & selecting:
	ast:{
		fileGlob:"",// string passed to npmjs.org/glob to fetch js files
		selector:"",// string passed to npmjs.com/esquery to target js
			// this is how eslint works; plug your code into
			// astexplorer.net or estools.github.io/esquery
			// to understand how to make these
		property:"",// string passed to npmjs.com/lodash-getpath
			// to extract string []
			// from the AST nodes selected above
			// this way you can select a prop
			// from all items in an [] (in an [], in an [],...)
	},
		// 2) or dynamically if what you want to document isn't in js:
	customInput({glob,fs}){
			// note you're given glob & fs
			// since you'll likely be manipulating files
		return anArrayOfStrings // or a promise for one
	},
		// 3) or directly:
	customInput:['a','b','c',...],
	
	// if you want to customize how to format the doc
	// there are some presets:
	customOutput:'ul|ol|table', //default is ul
	// or a fully custom option:
	customOutput(matchedDescriptions/* = {
			[name]:{
				name, - plain string of item supplied
				formattedName, - .md form for safe anchoring & extraction
				description, - plain content of description
				formattedDescription, - .md form for safe extraction
				slug, - pattern + name for canonical referencing in a file
				linkSafeSlug, - formatted slug for github-safe anchoring
				isBlank, - whether doc is empty
				[ast context if available] - (if you gathered items this way)
			}
			,...
		}
		*/){
		// in case you prefer the doc to look a very specific way,
		// return 1 string here to write to the markdown file.
		// Log out the given param to see what you have to work with.
		// Some form of given formattedName and formattedDescription
		// per item needs to exist in the returned string
		// to preserve data across rebuilds.
		// It should let you know if it cannot find them.
	},
},
//...add as many pattern objects as you'd like
])
```
In case that wasn't clear, check the examples.

## Examples
### module.exports
Say you wanted to require readme info for keys on all `module.export`ed objects, like:
```javascript
module.exports = {
	something,
	somethingElse,
	etcetera,
	soManyThings,
}
```
That could look like:
```javascript
require('doc-enforcer')([{
	name:"Module exports"
	markdownPath:"./readme.md"
	,ast:{
		fileGlob:`${__dirname}/**/wherever/they/are/**.js`,
		selector:"AssignmentExpression[left.object.name='module'][left.property.name='exports'][right.type='ObjectExpression']",
		property:"right.properties[].key.name",
	}
}])
```

### A Folder Structure
Say you wanted to guarantee new top level folders had mutually exclusive reasons for existing.
That might look like:
```javascript
require('doc-enforcer')([{
	name:"Top Level Folders",
	markdownPath:"./readme.md",
	customInput:({glob,fs})=>glob.sync(`${__dirname}/../*/`),
}])
```
### A CSV
Say your codebase makes CSVs for others to use and you wanted to document one's header.
Parse the file, extract your points of interest, return an array.
```javascript
require('doc-enforcer')([{
	name:"That CSV",
	markdownPath:"./test.md",
	customInput:({glob,fs})=>
		fs.readFileSync(`${__dirname}/test.md`).toString()
			.split('\n').shift().split(/\W/)
}])
```

### A Database Schema
Say you wanted a simple text explanation for each column added to the db.
That could simply look like this:

```javascript

require('doc-enforcer')([{
	name:"db-schema",
	markdownPath:"./readme.md",
	async customInput({glob,fs}){
		return new Promise((good,bad)=>{
			var mysql      = require('mysql');
			var connection = mysql.createConnection({
			  user     : 'x',
			  password : 'x',
			});
			connection.connect();
			connection.query(`
				SELECT column_name,table_name
				from information_schema.columns
				where table_schema='test'
			`,
			function (error, results, fields) {
				if (error) throw error;
				good(results.map(x=>`${x.table_name}.${x.column_name}`))
				connection.end();
			});
		})
	},
	customOutput:'table',
}])
```
If you also wanted each table to have a description, 
you'd need to alter the query to return a row per table.
Or, if you wanted it to look fancier with type info & other things, see below.

### A Fancier Database Schema
If you wanted to customize the output, like grouping columns by table or adding type info,
you might make `customInput` & `customOutput` functions, and store some info for reuse:
```javascript
var mysql=require('mysql')
var _=require('lodash')
var remember //store here things from customInput for customOutput
require('doc-enforcer')([{
	name:"db-schema",
	markdownPath:"./test.md",
	async customInput({glob,fs}){
		return new Promise((good,bad)=>{
			var mysql      = require('mysql');
			var connection = mysql.createConnection({
			  user     : 'x',
			  password : 'x',
			});
			connection.connect();
			connection.query(`
				select table_name,column_name,column_type
				from information_schema.columns
				where table_schema='test'
				/*
				 note you'll need the same # of rows returned
				 as descriptions to keep
				*/
				union
				select table_name,'',''
				from information_schema.tables
				where table_schema='test'
			`,
			function (error, results, fields) {
				if (error) throw error;
				var tokenize=x=>`${x.table_name}.${x.column_name}`
				remember=_.keyBy(results,tokenize)//for customOutput
				good(results.map(tokenize))
				connection.end();
			});
		})
	},
	customOutput(matches){
		return `<table>${_(matches)
			.map(x=>{
				var [table_name,column_name]=x.name.split('.')
				return {...x
					,table_name
					,column_name
					,...remember[x.name]
				}
			})
			.groupBy('table_name')
			.map((items,tableName)=>{
				var {tables:[table],columns} = _.groupBy(items,x=>x.column_name?'columns':'tables')
				return `<tr alt="item:${table.slug}"><td>
					${table.formattedName
						.replace(`.<`,'<')
					} - ${table.formattedDescription}
					<ul>${
						columns.map(col=>`
						<li alt="item:${col.slug}">${col.formattedName
							.replace(`<code>${table.name}`,'<code>')
						} <i>[${col.column_type}]</i> - ${col.formattedDescription}</li>`
							).join('')
					}
					</ul>
				</td></tr>`
			})
			.join('\n')}</table>`
	}
}])
```
(Or use something like [db-linter](http://npmjs.com/db-linter)!)

## Contra

* _"just read the code, it's the best documentation"_
	* Code is the excruciatingly _exact_ explanation, but often not phrased abstractly/high level enough to be useful as an overview.
	* Also, not every consumer of it will have the skill to read it or time for the deep dive necessary.
* _"all documentation inevitably becomes out of date"_
	* Documentation pointing to code that no longer exists is automatically removed in this process.
	* But ultimately that is true, especially if no one reads it because they don't know about it.  Hopefully as people are forced to update readmes because of these checks, they will glance over neighboring notes for accuracy.  And since it's not in some other system, devs will be near it every day.
	* Alternatively, maybe your environment has people depending on this now-easily-accessible documentation who will be more than happy to tell you first
* _"code comments are enough"_
	* In-code comments have it worst: they are obscured in code files but unexecutable,
	and are stereotyped as "code that gets stale", given neighboring executable code doesn't.
	One could consider IDEs/linting which parse docblocks as "execution", but that's secondary at best.
	* This doesn't work for the same reason _"just reading the code"_ isn't always an acceptable answer
	* Good luck relying on humans to always remember what to document
* _"why not just use jsdoc/docblocks and extract them?"_
	* eslint jsdoc / doc block rules do not have a fine grain option.  You could have an `.eslint` file
	in each folder that has all the files that rule should apply to,
	but then your folder structure is bending to a lint rule, which seems backwards,
	and that still will not cover cases for things not literally in your codebase.
	* copying code is bad. Even comments, from one place to another.

## References
* https://astexplorer.net/
* https://estools.github.io/esquery/
* https://www.npmjs.com/package/lodash-getpath
* https://www.npmjs.com/package/glob
* [Thamus](http://neamathisi.com/literacies/chapter-1-literacies-on-a-human-scale/socrates-on-the-forgetfulness-that-comes-with-writing) [vs Theuth](https://bearskin.org/2015/01/20/the-myth-of-thamus-and-theuth/) (aka Thoth)
