#!/usr/bin/env node

var fs = require('fs');
var path = require('path');
var program = require('commander');
var colors = require('colors');

program
	.version('0.0.2')
	.arguments('<type> <subtype> [dir] ')
	.usage('<type> [subtype] <dir> [options]')
	.action(async function(type, subtype, dir) {

		var pkgname = null;
		let declaredType = type = type.toLowerCase();

		var parentType = findFirstPackageValue(process.cwd(), [], "type");
		var parentName = findFirstPackageValue(process.cwd(), [], "name");

		let roots = {
			bot: path.normalize("bots/"),
			load: path.normalize("bots/"),
			enrich: path.normalize("bots/"),
			offload: path.normalize("bots/"),
			resource: path.normalize("apis/"),
		};
		let templatePath = null;

		let dirs = fs.readdirSync(path.resolve(__dirname, "./templates"));

		if (dirs.indexOf(type) === -1) {
			let paths = require('module')._nodeModulePaths(process.cwd());
			let modulePathExits = false;
			for (var key in paths) {
				let p = path.resolve(paths[key], `${type}/templates/${subtype}`);
				modulePathExits = modulePathExits || fs.existsSync(path.resolve(paths[key], `${type}`));
				if (fs.existsSync(p)) {
					templatePath = p
					break;
				}
			}
			if (dir && subtype && !templatePath) {
				if (!modulePathExits) {
					console.log(`Missing module '${type}'.  Run 'npm install ${type}' to install the module`);
				} else {
					console.log(`Unable to find template '${subtype}' in module '${type}/templates'`);
				}
				process.exit(1);
			} else if (!templatePath) {
				dir = subtype;
				subtype = undefined;
				console.log(`Unable to find template '${type}'`);
				process.exit(1);
			}
		} else {
			dir = subtype;
			subtype = undefined;
		}
		let prefix = "./";

		if (roots[type] && path.resolve(dir).indexOf(roots[type]) === -1) {
			prefix = roots[type] || "";
		}

		if (!fs.existsSync(prefix)) {
			fs.mkdirSync(prefix);
		}

		if (!fs.existsSync(prefix + dir)) {
			let utils = {
				createLeoConfig: require("./lib/createLeoConfig.js"),
				createLeoEnviornments: require('./lib/createLeoEnviornments.js'),
				storeLeoConfigJS: function(template) {
					fs.writeFileSync(path.resolve(prefix + dir, "leo_config.js"), template);
				},
				npmInstall: function(cwd) {
					if (!cwd) {
						cwd = path.resolve(prefix + dir);
					} else {
						cwd = path.resolve(cwd);
					}
					console.log(`------ Running NPM Install on "${cwd}" ------`);
					require('child_process').execSync("npm install", {
						cwd: cwd
					});
				}
			};



			let setupFile = path.resolve(__dirname, 'templates/', type, 'setup.js');
			let setup = {
				inquire: () => {},
				process: () => {}
			}
			if (fs.existsSync(setupFile)) {
				setup = require(setupFile);
			}
			let setupContext = await setup.inquire(utils);

			switch (type) {
				case 'quickstart':
				case 'microservice':
				case 'system':
					copyDirectorySync(__dirname + "/templates/" + type, prefix + dir, {
						'____DIRNAME____': parentName + "-" + dir.replace(/\s+/g, '_')
					}, [
						/setup\.js$/
					]);
					break;

				default:
					if (parentType != "microservice" && parentType != "system") {
						console.log(`Type ${type} must be within a system or microservice package`);
						process.exit(1);
					}
					templatePath = templatePath || `${__dirname}/templates/${type}`;
					copyDirectorySync(templatePath, prefix + dir, {
						'____DIRNAME____': parentName + "-" + dir.replace(/\s+/g, '_'),
						'____BOTNAME____': parentName + "-" + dir.replace(/\s+/g, '_'),
						'____BOTTYPE____': declaredType
					}, [
						/setup\.js$/
					]);
					break;
			}
			await setup.process(utils, setupContext);

			utils.npmInstall();

			console.log(`OK: Finished creating '${dir}'`);
		} else {
			console.log("Directory already exists");
		}
	})
	.parse(process.argv);

if (!process.argv.slice(2).length) {
	program.outputHelp(colors.red);
}

function copyDirectorySync(src, dest, replacements, ignore = []) {
	for (var i = 0; i < ignore.length; i++) {
		if (src.match(ignore[i])) {
			return;
		}
	}
	var stats = fs.statSync(src);
	if (stats.isDirectory()) {
		fs.mkdirSync(dest);
		fs.readdirSync(src).forEach(function(entry) {
			copyDirectorySync(path.join(src, entry), path.join(dest, entry), replacements, ignore);
		});
	} else {
		var fileText = fs.readFileSync(src).toString('utf8');
		for (var replaceVar in replacements) {
			fileText = fileText.replace(new RegExp(replaceVar, 'g'), replacements[replaceVar]);
		}
		fs.writeFileSync(dest, fileText);
	}
}

function findParentFiles(dir, filename) {
	var paths = [];
	do {
		paths.push(dir);

		var lastDir = dir;
		dir = path.resolve(dir, "../");
	} while (dir != lastDir);

	var matches = [];
	paths.forEach(function(dir) {
		var file = path.resolve(dir, filename);
		if (fs.existsSync(file)) {

			matches.push(file);
		}
	});

	return matches;
}

function findFirstPackageValue(dir, types, field, reverse) {
	if (!Array.isArray(types)) {
		types = [types];
	}
	var paths = findParentFiles(dir, "package.json");
	if (reverse) {
		paths.reverse();
	}
	for (var i = 0; i < paths.length; i++) {
		var file = paths[i];
		var pkg = require(file);
		if (pkg && pkg.config && pkg.config.leo && (types.length === 0 || types.indexOf(pkg.config.leo.type) !== -1)) {
			return pkg.config.leo[field] || pkg[field];
		}
	}
	return null;
}
