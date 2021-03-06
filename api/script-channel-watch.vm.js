/*
todo
チューナー操作はオペレーターに任せるべき
*/
(function() {
	
	var channel = null;
	
	data.schedule.forEach(function(ch) {
		if (ch.id === request.param.chid) {
			channel = ch;
		}
	});
	
	if (channel === null) return response.error(404);
	
	if (!data.status.feature.streamer) return response.error(403);
	
	switch (request.type) {
		// HTTP Live Streaming (Experimental)
		case 'txt'://for debug
		case 'm3u8':
			response.head(200);
			
			// var current  = (program.end - program.start) / 1000;
			var current = 0;
			
			var d = {
				t    : request.query.t      || '5',//duration(seconds)
				s    : request.query.s      || '1024x576',//size(WxH)
				'c:v': request.query['c:v'] || 'libx264',//vcodec
				'c:a': request.query['c:a'] || 'libfdk_aac',//acodec
				'b:v': request.query['b:v'] || '1M',//bitrate
				'b:a': request.query['b:a'] || '96k'//ab
			};
			
			d.t = parseInt(d.t, 10);
			
			response.write('#EXTM3U\n');
			response.write('#EXT-X-TARGETDURATION:' + d.t + '\n');
			response.write('#EXT-X-MEDIA-SEQUENCE:0\n');
			
			var target = request.query.prefix || '';
			target += 'watch.m2ts?nore=1&t=' + d.t + '&c:v=' + d['c:v'] + '&c:a=' + d['c:a'];
			target += '&b:v=' + d['b:v'] + '&s=' + d.s + '&b:a=' + d['b:a'];
			
			for (var i = 0; i < current; i += d.t) {
				response.write('#EXTINF:' + d.t + ',\n');
				response.write(target + '&ss=' + i + '\n');
			}
			
			response.end('#EXT-X-ENDLIST');
			return;
		
		case 'xspf':
			response.setHeader('content-disposition', 'attachment; filename="' + program.id + '.xspf"');
			response.head(200);
			
			var ext    = request.query.ext || 'm2ts';
			var prefix = request.query.prefix || '';
			
			var target = prefix + 'watch.' + ext  + url.parse(request.url).search;
			
			response.write('<?xml version="1.0" encoding="UTF-8"?>\n');
			response.write('<playlist version="1" xmlns="http://xspf.org/ns/0/">\n');
			response.write('<trackList>\n');
			response.write('<track>\n<location>' + target.replace(/&/g, '&amp;') + '</location>\n');
			response.write('<title>' + program.title + '</title>\n</track>\n');
			response.write('</trackList>\n');
			response.write('</playlist>\n');
			
			response.end();
			return;
		
		case 'm2ts':
		case 'f4v':
		case 'flv':
		case 'webm':
		case 'asf':
			response.head(200);
			
			// util.log('[streamer] streaming: ' + program.recorded);
			
			var d = {
				ss   : request.query.ss     || '0', //start(seconds)
				t    : request.query.t      || null,//duration(seconds)
				s    : request.query.s      || null,//size(WxH)
				f    : request.query.f      || null,//format
				'c:v': request.query['c:v'] || null,//vcodec
				'c:a': request.query['c:a'] || null,//acodec
				'b:v': request.query['b:v'] || null,//bitrate
				'b:a': request.query['b:a'] || null,//ab
				ar   : request.query.ar     || null,//ar(Hz)
				r    : request.query.r      || null//rate(fps)
			};
			
			switch (request.type) {
				case 'm2ts':
					d.f      = 'mpegts';
					break;
				case 'webm':
					d.f      = 'webm';
					d['c:v'] = d['c:v'] || 'libvpx';
					d['c:a'] = d['c:a'] || 'libvorbis';
					break;
				case 'flv':
					d.f      = 'flv';
					d['c:v'] = d['c:v'] || 'flv';
					d['c:a'] = d['c:a'] || 'libfdk_aac';
					break;
				case 'f4v':
					d.f      = 'flv';
					d['c:v'] = d['c:v'] || 'libx264';
					d['c:a'] = d['c:a'] || 'libfdk_aac';
					break;
				case 'asf':
					d.f      = 'asf';
					d['c:v'] = d['c:v'] || 'wmv2';
					d['c:a'] = d['c:a'] || 'wmav2';//or libfdk_aac ?
					break;
			}
			
			var args = [];
			
			if (!request.query.debug) args.push('-v', '0');
			
			args.push('-ss', (parseInt(d.ss, 10) - 1) + '');
			
			if (!request.query.nore) args.push('-re');
			
			args.push('-i', 'pipe:0');
			args.push('-ss', '1');
			
			if (d.t) { args.push('-t', d.t); }
			
			args.push('-threads', 'auto');
			
			if (d['c:v']) args.push('-c:v', d['c:v']);
			if (d['c:a']) args.push('-c:a', d['c:a']);
			
			if (d.s)  args.push('-s', d.s);
			if (d.r)  args.push('-r', d.r);
			if (d.ar) args.push('-ar', d.ar);
			
			if (d['b:v']) args.push('-b:v', d['b:v']);
			if (d['b:a']) args.push('-b:a', d['b:a']);
			
			//if (format === 'flv')     { args.push('-vsync', '2'); }
			if (d['c:v'] === 'libx264') args.push('-preset', 'ultrafast');
			if (d['c:v'] === 'libvpx')  args.push('-deadline', 'realtime');
			
			args.push('-y', '-f', d.f, 'pipe:1');

			// チューナーを選ぶ
			var tuner = chinachu.getFreeTunerSync(config.tuners, channel.type);
			
			// チューナーが見つからない
			if (tuner === null) {
				util.log('WARNING: 利用可能なチューナーが見つかりません (存在しないかロックされています)');
				return response.error(409);
			}
			
			// スクランブルされている
			if (tuner.isScrambling) {
				return response.error(409);
			}
			
			// チューナーをロック
			try {
				chinachu.lockTunerSync(tuner);
			} catch (e) {
				util.log('WARNING: チューナー(' + tuner.n + ')のロックに失敗しました');
				return response.error(500);
			}
			util.log(JSON.stringify(tuner));
			var tunerCommad = tuner.command;
			// tunerCommad = tunerCommad.replace(' --sid', '');
			// tunerCommad = tunerCommad.replace(' <sid>', '');
			tunerCommad = tunerCommad.replace('<sid>', channel.sid);
			tunerCommad = tunerCommad.replace('<channel>', channel.channel);
			// return;
			util.log('LOCK: LIVE ' + tuner.name + ' (n=' + tuner.n + ')');
	
			// var out = fs.openSync('/tmp/chinachu-live', 'a');
			// var recpt1 = child_process.spawn('recpt1', ['--b25', '--strip', request.param.id, '-', '-']);
			var recpt1 = child_process.spawn(tunerCommad.split(' ')[0], tunerCommad.replace(/[^ ]+ /, '').split(' '));
			chinachu.writeTunerPid(tuner, recpt1.pid);
			// util.log(['--b25', '--strip', request.param.id, '-', '/dev/stdout'].join(' '));
			var avconv = child_process.spawn('avconv', args);
			// util.log(args.join(' '));
			// util.log(util.inspect(recpt1));
			util.log(args.join(' '));
			
			// avconv.stdin.pipe(recpt1.stdout, {end: false});
			avconv.stdout.pipe(response);

			recpt1.stdout.on('data', function(d) {
				avconv.stdin.write(d);
			});
			recpt1.stderr.on('data', function(d) {
				util.log(d);
			});
			
			avconv.stderr.on('data', function(d) {
				util.log(d);
			});
			
			avconv.on('exit', function(code) {
				setTimeout(function() { response.end(); }, 1000);
			});
			
			request.on('close', function() {
				// チューナーのロックを解除
				try {
					chinachu.unlockTunerSync(tuner);
					util.log('UNLOCK: ' + tuner.name + ' (n=' + tuner.n + ')');
				} catch (e) {
					util.log(e);
				}

				avconv.stdout.removeAllListeners('data');
				avconv.stderr.removeAllListeners('data');
				avconv.kill('SIGKILL');
			});
			
			children.push(avconv);// 安全対策
			children.push(recpt1);// 安全対策
			
			return;
	}//<--switch

}());