/* eslint-disable */

var debug = false;
var isPlaying = false;
/*I.e. approx. number of samples between falling edges of trigger pulse.*/

var AVG_SAMPLES_PER_LINE = 734;
var leftChannel = {
  go: true,
  offset: 1450000, // 1000000
  samples: null,
  haltOnError: false,
  canvasName: "imgCanvasLeft",
  plotName: "plotLeft",
};
var rightChannel = {
  go: true,
  offset: 1450000,
  samples: null,
  haltOnError: false,
  canvasName: "imgCanvasRight",
  plotName: "plotRight",
};

/**
 * 绘制波形图
 */
function updateOscilloscope(channel, scanlineLength, marker0, marker1) {
  var c = document.getElementById(channel.plotName);
  var buffer = channel.samples;
  var offset = channel.offset;
  var ctx = c.getContext("2d");
  var zoom = 200;
  var W = c.width;
  var H = c.height;
  var center = H / 2;
  var x = 0;
  var dx = W / scanlineLength;
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  ctx.moveTo(x, center);
  /**/

  var plotStart = -140;

  for (var i = 0; i < scanlineLength; i++) {
    x += dx;
    ctx.lineTo(x, center - buffer[i + offset + plotStart] * zoom);
  }
  /*Draw vertical debug markers*/

  if (debug) {
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, center - marker0 * zoom);
    ctx.lineTo(W, center - marker0 * zoom);
    ctx.moveTo(0, center - marker1 * zoom);
    ctx.lineTo(W, center - marker1 * zoom);
    ctx.moveTo(W - plotStart * dx, 0);
    ctx.lineTo(W - plotStart * dx, H);
  }

  ctx.stroke();
}

/*Draws a complete pixel line, the offset has to be set to the end
 * of a sync pulse when calling this function.*/
function displayLatestScanline(channel) {
  var canvas = document.getElementById(channel.canvasName);
  var ctx = canvas.getContext("2d");
  var w = canvas.width,
    h = canvas.height;
  var scanline_image_data = ctx.createImageData(w, 1);
  var scanline_pixel_row = scanline_image_data.data;
  /*Shift the prervious rows to make room for a new row, old rows that move
   * past the image area are discarded by this!*/

  var imageData = ctx.getImageData(0, 0, w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.putImageData(imageData, 0, -2);
  /*Populate the scan line, pixel by pixel*/

  for (var i = 0; i < w; i++) {
    /*This takes some experimentation, the circle is good for this*/
    var intensety = 108 - channel.samples[channel.offset + w - i] * 2555;
    scanline_pixel_row[0 + i * 4] = intensety; //red

    scanline_pixel_row[1 + i * 4] = intensety; //green

    scanline_pixel_row[2 + i * 4] = intensety; //blue

    scanline_pixel_row[3 + i * 4] = 255; //alpha
  }
  /*Plot the scan line pixel row*/

  ctx.putImageData(scanline_image_data, 0, h - 2);
  ctx.putImageData(scanline_image_data, 0, h - 1);
}

/*Finds the offset at the next sync pulse*/
function nextLine(channel) {
  //Statemachine
  var pulseCount = 0;
  var triggerCount = 2;
  var lowLevel = 0;
  var highLevelReachedCounter = 0;
  channel.offset += 300; // org 300
  var maxInterimageSamples = 10000;
  /*Not actually 10000*/

  var max = 0;
  var lookahead = 850;
  /*Find the maximum value in the comming smaples*/

  for (var i = 0; i < lookahead; i++) {
    var sample = channel.samples[channel.offset + i];
    if (sample > max) max = sample;
  }

  lowLevel = max * 0.1;
  /*Try to find the next sync pulse*/

  for (var _i = -100; _i < maxInterimageSamples; _i++) {
    /*Start scanning for a sync falling edge when we observe a maximum*/
    if (channel.samples[channel.offset] === max) {
      highLevelReachedCounter = 60;
    }

    highLevelReachedCounter -= 1;

    if (channel.samples[channel.offset] > lowLevel) {
      pulseCount++;
    } else {
      var pulseIsLongEnough = pulseCount > triggerCount;
      var maxWasRecent = highLevelReachedCounter > 0;
      /*We have transitioned, check if actual falling edge*/

      if (pulseIsLongEnough && maxWasRecent) {
        /*For debuging,indicate were we triggered*/
        if (debug) {
          channel.samples[channel.offset] = 1;
          channel.samples[channel.offset + 1] = -1;
          channel.samples[channel.offset + 2] = 1;
        }
        /*Channel will now be returned ready with pointer just after the
         * pulse*/

        return channel;
      }

      pulseCount = 0;
      highLevelReachedCounter = 0;
    }

    channel.offset += 1;
  }

  if (channel.haltOnError) channel.go = false;
  return channel;
}

function startDisplayingChannel(channel) {
  setInterval(function () {
    if (!channel.go) return;
    var oldOffset = channel.offset; //Try to find the next pulse

    channel = nextLine(channel);
    displayLatestScanline(channel);
    updateOscilloscope(channel, 3000, 0, 0);

    if (debug) {
      var samplesScannedBeforePulse = channel.offset - oldOffset;

      if (
        samplesScannedBeforePulse > AVG_SAMPLES_PER_LINE + 80 ||
        samplesScannedBeforePulse < AVG_SAMPLES_PER_LINE - 89
      ) {
        console.log(
          "Missed trigger pulse! Scanned",
          samplesScannedBeforePulse,
          "samples instead"
        );
        if (channel.haltOnError) channel.go = false;
      }
    }
  }, 17);
}

function onloadCallback(buffer) {
  var dom = document.getElementById("load-progress");
  dom.style.display = "none";
  var dom = document.getElementById("load-container");
  dom.style.display = "block";
  leftChannel.samples = buffer.getChannelData(0);
  rightChannel.samples = buffer.getChannelData(1);
  startDisplayingChannel(leftChannel);
  startDisplayingChannel(rightChannel);
  initAudio();
  console.log(isPlaying);
  if (!isPlaying) {
    playAudio();
    setTimeout(function () {
      pauseAudio();
    }, 2000);
  } else {
    playAudio();
  }
}

window.AudioContext = window.AudioContext || window.webkitAudioContext;
var context = new AudioContext();

function onError(e) {
  console.error("error", e);
}

function loadSound(url, onloadCallback, loadingProgressCb) {
  var request = new XMLHttpRequest();
  request.open("GET", url, true);
  request.responseType = "arraybuffer";
  request.onprogress = function (e) {
    var total_filesize = 15164394;
    loadingProgressCb(0.9 * Math.round((100 * e.loaded) / total_filesize));
  };
  request.onload = function () {
    context.decodeAudioData(
      request.response,
      function (buffer) {
        loadingProgressCb(100);
        onloadCallback(buffer);
      },
      onError
    );
  };
  request.send();
}

function loadingProgress(progress) {
  const dom = document.getElementById("load-text");
  dom.innerHTML = `${Math.round(progress)}%`;
}

// 切换播放与暂停
function playAudio() {
  leftChannel.go = true;
  rightChannel.go = true;
  var audio = document.getElementById("load-audio");
  audio.play();
  isPlaying = true;
}

function pauseAudio() {
  leftChannel.go = false;
  rightChannel.go = false;

  var audio = document.getElementById("load-audio");
  audio.pause();
  isPlaying = false;
}

function initAudio() {
  var audio = document.getElementById("load-audio");
  audio.currentTime = 42; // 20
}

window.onload = function () {
  loadSound(
    "https://s1.ogww.com/lab/spacecraft/golden-record/audio-image.mp3",
    onloadCallback,
    loadingProgress
  );
};
