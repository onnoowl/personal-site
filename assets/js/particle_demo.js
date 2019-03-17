if (typeof (WebGL2RenderingContext) !== "undefined") {
  Number.prototype.clamp = function (min, max) {
    return Math.min(Math.max(this, min), max);
  };

  function getSeconds() {
    return new Date().getTime() / 1000;
  }

  function random(rangeStart, rangeEnd) {
    return rangeStart + Math.random() * (rangeEnd - rangeStart);
  }

  // function shuffle(a) {
  //   for (let i = a.length - 1; i > 0; i--) {
  //     const j = Math.floor(Math.random() * (i + 1));
  //     [a[i], a[j]] = [a[j], a[i]];
  //   }
  //   return a;
  // }

  class RandAnimated {
    constructor(valRangeBegin, valRangeEnd, timeRangeBegin, timeRangeEnd) {
      this.valRangeBegin = valRangeBegin;
      this.valRangeEnd = valRangeEnd;
      this.timeRangeBegin = timeRangeBegin;
      this.timeRangeEnd = timeRangeEnd;


      this.val = random(valRangeBegin, valRangeEnd);

      this.pick_next();
    }

    pick_next() {
      this.last_val = this.val;
      this.last_time = getSeconds();

      this.next_val = random(this.valRangeBegin, this.valRangeEnd);
      this.next_time = getSeconds() + random(this.timeRangeBegin, this.timeRangeEnd);
    }

    update() {
      var perc_there = (getSeconds() - this.last_time) / (this.next_time - this.last_time);
      this.val = (perc_there.clamp(0.0, 1.0) * (this.next_val - this.last_val) + this.last_val)
      if (perc_there > 1.0) {
        this.pick_next()
      }
    }
  }

  var omega1 = new RandAnimated(1.0, 5.0, 3.0, 20.0);
  var omega2 = new RandAnimated(0.1, 2.5, 3.0, 20.0);
  var omega3 = new RandAnimated(0.1, 2.5, 3.0, 20.0);

  var posRandRange = 0.5;
  var velRandRange = 0.215
  var numParticles = 150 * 150;

  var arrayNodeId = [];
  var nodeId = 0;
  var arrayNodePosXYZW = [];
  var arrayNodeVertexColor = [];
  var arrayNodeVel = [];

  // initialize some nodes
  var iniNodes = (function (numNodes) {
    var addNode = function (jsonIn) {
      arrayNodeId.push(nodeId);
      arrayNodePosXYZW.push(jsonIn.position[0], jsonIn.position[1], jsonIn.position[2], 1.0);
      arrayNodeVertexColor.push(jsonIn.color[0], jsonIn.color[1], jsonIn.color[2], 1.0);

      var x = -velRandRange + (Math.random() * 2 * velRandRange);
      var y = -velRandRange + (Math.random() * 2 * velRandRange);
      var z = -velRandRange + (Math.random() * 2 * velRandRange);
      arrayNodeVel.push(x, y, z, 0.0);

      nodeId++;
    };

    for (var n = 0; n < numNodes; n++) {
      var x = -posRandRange + (Math.random() * 2 * posRandRange);
      var y = -posRandRange + (Math.random() * 2 * posRandRange);
      var z = -posRandRange + (Math.random() * 2 * posRandRange);

      // var b1 = Math.random();
      // var rg1 = b1 * Math.random();

      // var color2 = shuffle([
      //   Math.random() / 2,
      //   Math.random(),
      //   1 - (Math.random() / 2)
      // ]);

      // var final_color = [rg1 * 0.8 + 0.1 * color2[0], rg1 * 0.8 + 0.1 * color2[1], b1 * 0.8 + 0.1 * color2[2]];

      var node = addNode({
        "position": [x, y, z],
        "color": [Math.random(), Math.random(), Math.random()]
      });
    }
  })(numParticles);

  var canvas = document.getElementById("graph");

  var gpufG = new gpufor(canvas, // target canvas

    // VALUES
    {
      "float4* posXYZW": arrayNodePosXYZW,
      "float4* vel": arrayNodeVel,
      "float*attr nodeId": arrayNodeId,
      "float4*attr nodeVertexCol": arrayNodeVertexColor,
      "mat4 PMatrix": transpose(getProyection(canvas.width / canvas.height)),
      "mat4 cameraWMatrix": transpose(new Float32Array([1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, -3.0,
        0.0, 0.0, 0.0, 1.0])),

      'float omega1': omega1.val,
      'float omega2': omega2.val,
      'float omega3': omega3.val,
      'float phase_shift1': -338.67426,
      'float phase_shift2': -130.25932,
      'float phase_shift3': 216.23048,
      'float friction': 0.01
    },

    // KERNEL PROGRAM 1 (update "vel" & "posXYZW" in return instruction)
    {
      "type": "KERNEL",
      "name": "PARTICLE_KERNEL",
      "viewSource": false,
      "config": ["n", ["vel", "posXYZW"],
        // head
        `
        vec2 get_id(int id) {
          return get_global_id(float(id), uBufferWidth, 1.0);
        }
        `,
        // source
        `
        const float M_PI = 3.1415926538;
        int idx = int(nodeId[n]);
        int len = `+ numParticles + `;

        vec3 p = posXYZW[n].xyz;
        vec3 v = (vel[n]).xyz;
        float mag;
        vec3 accel;

        int leader = (idx + 1) % len;
        mag = 0.6;
        accel = mag * normalize(posXYZW[get_id(leader)].xyz);
        v += accel;

        int numInteractions = 200;
        for (int counter = 0; counter < numInteractions; counter++) {
          int i = (idx+ (counter - numInteractions/2))%len;
          if (i != idx) {
            vec3 o = posXYZW[get_id(i)].xyz;
            vec3 dif = (o - p);
            float dif_mag = length(dif);
            vec3 normal_dif = normalize(dif);

            mag = -30.0*0.218 * exp(-40.0*dif_mag);
            accel = mag * normal_dif / float(numInteractions);
            v += accel;

            mag = 4.318 * (
              -cos(omega1*M_PI * dif_mag + (phase_shift1 + 1.5*float(idx % 10000)/5000.0 - 5000.0)) +
              -cos(omega2*M_PI * dif_mag + phase_shift2) +
              -1.5*cos(omega3*M_PI * dif_mag + phase_shift3)
            );
            accel = mag * normal_dif / float(numInteractions);
            v += accel;
          }
        }

        float l = length(p);
        mag = 0.4 * l*l;
        accel = mag * normalize(p) * -1.0;
        v += accel;

        v *= friction;

        p += v;

        p += -0.010f * normalize(cross(p, vec3(0.4f, 0.6f, 0.0f))) * float(idx%3 == 0);
        p += 0.010f * normalize(cross(p, vec3(-0.6f, 0.4f, 0.0f))) * float((idx+1)%3 == 0);
        p += 0.004f * normalize(cross(p, vec3(1.0f, 0.0f, 0.0f))) * float((idx+2)%3 == 0);

        return [vec4(v, 1.0), vec4(p, 1.0)];
        `
      ],
      "drawMode": 4,
      "depthTest": true,
      "blend": false,
      "blendEquation": "FUNC_ADD",
      "blendSrcMode": "SRC_ALPHA",
      "blendDstMode": "ONE_MINUS_SRC_ALPHA"
    },

    // GRAPHIC PROGRAM
    {
      "type": "GRAPHIC",
      "name": "PARTICLE_GRAPHIC",
      "viewSource": false,

      "config": [
        // vertex head
        `out vec4 vVertexColor;`,

        // vertex source
        `
        vec2 xx = get_global_id(nodeId[], uBufferWidth, 1.0);


        vec3 vertex_position = posXYZW[xx].xyz;
        vec4 nodeVertexColor = nodeVertexCol[];

        gl_Position = PMatrix * cameraWMatrix * vec4(vertex_position*2.0, 1.0);
        gl_PointSize = 6.0 / gl_Position.z;
        vVertexColor = vec4( (abs(normalize(vertex_position*2.0))*1.2 + 0.2)*0.3 + nodeVertexColor.xyz*0.6, 1.0 );
        `,

        // fragment head
        `in vec4 vVertexColor;`,

        // fragment source
        `return vVertexColor;`
      ],
      "drawMode": 0,
      "depthTest": true,
      "blend": false,
      "blendEquation": "FUNC_ADD",
      "blendSrcMode": "SRC_ALPHA",
      "blendDstMode": "ONE_MINUS_SRC_ALPHA"
    });

  function onResize() {
    var gl = gpufG.getCtx();
    var realToCSSPixels = window.devicePixelRatio;

    // Lookup the size the browser is displaying the canvas in CSS pixels
    // and compute a size needed to make our drawingbuffer match it in
    // device pixels.
    var displayWidth = Math.floor(gl.canvas.clientWidth * realToCSSPixels);
    var displayHeight = Math.floor(gl.canvas.clientHeight * realToCSSPixels);

    // Check if the canvas is not the same size.
    if (gl.canvas.width !== displayWidth || gl.canvas.height !== displayHeight) {

      // Make the canvas the same size
      gl.canvas.width = displayWidth;
      gl.canvas.height = displayHeight;
    }
  }

  window.addEventListener("resize", onResize);

  var startTime = getSeconds();
  var tick = function () {
    var time = getSeconds() - startTime;
    window.requestAnimFrame(tick);

    gpufG.processKernels();

    var gl = gpufG.getCtx();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    //gpufG.setArg("pole1X", 30);

    omega1.update();
    omega2.update();
    omega3.update();

    gpufG.setArg("omega1", omega1.val);
    gpufG.setArg("omega2", omega2.val);
    gpufG.setArg("omega3", omega3.val);
    gpufG.setArg("phase_shift1", (0.5 * -1.3 * time));
    gpufG.setArg("phase_shift2", (0.5 * -0.47 * time));
    gpufG.setArg("phase_shift3", (0.5 * 0.83 * time));
    gpufG.setArg("PMatrix", transpose(getProyection(gl.canvas.width / gl.canvas.height)));

    gpufG.processGraphic("posXYZW");
  };

  onResize();
  window.onload = tick;
} else {
  console.log("Error, WebGL2RenderingContext not found.");
  document.getElementById("graph-container").innerHTML = "<div class=\"card\"><h1>Unsupported Platform</h1><p>Sorry, WebGL2RenderingContext was not found.</p><p>Please use either Firefox or Chrome to view this demo.</p></div>";
}