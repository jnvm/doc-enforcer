['uncaughtException','unhandledRejection'].forEach(e=>{
	process.on(e,(err)=>{
		console.error(err)
		process.exit(1)
	})
})
var _=require('lodash-getpath')
	,eachVar=require('eachvar')
	,{cheerio,pretty,espree,esquery,glob,fs}=eachVar(require)
	,moduleName='doc-enforcer'

function makePattern(pattern){
	_.defaults(pattern,{
		customOutput:'ul',
		verbose:true,
		optional:false
	})
	return {...pattern
		,async apply(){
			//fetch the strings to document
			var meta={}
				,stringsToDocument
			if(pattern.ast){
				var filePaths=glob.sync(pattern.ast.fileGlob)
				stringsToDocument=_.flatten(
					filePaths.map(filePath=>{
						var js=fs.readFileSync(filePath).toString()
							,ast=espree.parse(js,{ecmaVersion:new Date().getFullYear()})
							,matches=_(esquery.match(ast,esquery.parse(pattern.ast.selector)))
								.map(node=>{
									var finds=_.getPath(node,pattern.ast.property)
									//store some context for custom format case
									_.castArray(finds).forEach(str=>{
										meta[str]={
											...(meta[str]||{})
											,astNode:node
											,fullAst:ast
											,filePath
										}
									})
									return finds
								})
								.flattenDeep()
								.value()
								//consider handing nodes to customizer
						return matches
					})
				)
			}
			else if(pattern.customInput){
				if(_.isArray(pattern.customInput)) stringsToDocument=pattern.customInput
				else if(_.isFunction(pattern.customInput)) stringsToDocument=await pattern.customInput({glob,fs})
				else throw new Error(`customInput must be:
an array of strings
or
a function that a/synchronously returns an array of strings`)
				if(!_.isArray(stringsToDocument)) throw new Error(`customInput did not return an array`)
				stringsToDocument=_.compact(stringsToDocument)
				stringsToDocument.forEach(str=>{
					if(str.constructor!==String) throw new Error(`customInput did not return an array of only strings`)
				})
			}
			else throw new Error(`no ast or customInput given, do not know what to gather for pattern named: ${pattern.name}`)
			
			//extract what is currently documented
			var docDelimiter = `<!--${moduleName}:${pattern.name}-->`
				,machine= str => _.deburr(str)
				,slugify= str => [pattern.name,str].map(machine).join('.')
				,nameSelector=`[alt^='name-${slugify('')}']`
				,descriptionSelector= name=>`[alt^='description-${slugify(name)}']`
				,blankDescriptionComment= name => `\n<!-- replace this comment with ${machine(pattern.name)}.${name} description -->\n`
				,md= fs.existsSync(pattern.markdownPath)
					? fs.readFileSync(pattern.markdownPath).toString()
					: (fs.writeFileSync(pattern.markdownPath,''), '')
				,[before='',html='<div></div>',after=''] = md.split(docDelimiter)
				,$=cheerio.load(html)
				,getName= el=> $(el).attr('alt').split(new RegExp(`^name-${slugify('')}`))[1].trim()
				,namesFound=$(nameSelector).toArray()
				,namesMissing=_.difference(
						stringsToDocument
						,_.compact(namesFound.map(x=>getName(x)))
					)
					.map(x=>$(`<div/>`).attr({alt:`name-${slugify(x)}`}))
				,formattedItems=_(namesFound)
					.concat(namesMissing)
					.map((item)=>{
						item=$(item)
						var  name=getName(item)
							,description=$(descriptionSelector(name)).first()
							,isBlank=!description
								|| !description.text().replace(/\s/g,'')
								|| description.text().trim()==blankDescriptionComment(name)
							,slug=slugify(name)
							,linkSafeSlug=_.kebabCase(slug)
						if(isBlank) description=$("<rt/>")
							.html(blankDescriptionComment(name))
						
						return({
							name
							,formattedName:`<a href="#name-${linkSafeSlug}" id="name-${linkSafeSlug}" alt="name-${slug}" >\n<code>${name}</code>\n</a>`
							,description:description.html()
							,formattedDescription:`<rt alt="description-${slug}">${description.html()}</rt>`
							,slug
							,linkSafeSlug
							,isBlank
							,...(meta[name]||{})
						})
					})
					.filter(x=>x.name && stringsToDocument.includes(x.name))
					.sortBy('name')
					.keyBy('name')
					.mapValues((v,k)=>v.length ? v[0] : v)
					.value()
					
			//write out in desired format
			//rewrite to current matching set, removing vestigal things, gathering undocumented
			if(['ul','ol'].includes(pattern.customOutput)){
				let listType=pattern.customOutput
				html=`
<${listType}>${
	_.map(formattedItems,(o,name)=>`
	<li>
		${o.formattedName} - ${o.formattedDescription}
	</li>`
	).join('')}
</${listType}>`
			}
			else if(pattern.customOutput==='table'){
				html=`
<table>
	<thead><tr><th>${pattern.name}</th></tr></thead>
	<tbody>${
	_.map(formattedItems,(o,name)=>`
		<tr>
			<td>
				${o.formattedName} - ${o.formattedDescription}
			</td>
		</tr>`
	).join('')}
	</tbody>
</table>`
			}
			else if(pattern.customOutput.constructor===Function){
				html=pattern.customOutput(formattedItems)
				//validate stuff is extractable
				var $2=cheerio.load(`<div>${html}</div>`)
				if($2(nameSelector).length!=stringsToDocument.length){
					throw new Error(`customOutput cannot find as many names via selector ${nameSelector} in output HTML as needed for input strings`)
				}
				if($2(descriptionSelector('')).length!=stringsToDocument.length){
					throw new Error(`customOutput cannot find as many descriptions via selector ${descriptionSelector('')} in output HTML as needed for input strings`)
				}
			}
			else throw new Error(`cannot determine output from customOutput: ${pattern.customOutput}`)
			
			var fullDoc=`${before}${docDelimiter}\n${pretty(html)}\n${docDelimiter}${after}`
			fs.writeFileSync(pattern.markdownPath,fullDoc)
			var lines=fullDoc.split('\n')
			var lineNumberFor=name=> _.findIndex(lines,line=>line.match(blankDescriptionComment(name).trim()))+1
			
			//log out results
			console.log(`\n${pattern.name}:`)
			var fine=true
			_.each(formattedItems,({name,isBlank,slug},k)=>{
				if(isBlank){
					console.error(`❌ ${name} needs documentation at ${pattern.markdownPath}#L${lineNumberFor(name)}`)
					fine=false
				}
				else if(pattern.verbose) console.log(`✔️ ${name} documented!`)
			})
			if(fine) console.log(`👌️ fully documented!`)
			else if(!pattern.optional) throw new Error(`all necessary items not documented`)
		}
	}
}

module.exports=function(patterns){
	return patterns.reduce((set,pattern)=>
		set.then(()=>
			makePattern(pattern).apply()
		)
	,Promise.resolve(1))
}