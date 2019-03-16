if (typeof (WebGL2RenderingContext) !== "undefined") {
  var posRandRange = 10.5;
  var velRandRange = 0.215
  var numParticles = 1000;

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

      var node = addNode({
        "position": [x, y, z],
        "color": [Math.random(), Math.random(), Math.random()]
      });
    }
  })(numParticles);

  var gpufG = new gpufor(document.getElementById("graph"), // target canvas

    // VALUES
    {
      "float4* posXYZW": arrayNodePosXYZW,
      "float4* vel": arrayNodeVel,
      "float*attr nodeId": arrayNodeId,
      "float4*attr nodeVertexCol": arrayNodeVertexColor,
      "mat4 PMatrix": transpose(getProyection()),
      "mat4 cameraWMatrix": transpose(new Float32Array([1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, -3.0,
        0.0, 0.0, 0.0, 1.0])),
      'float pole1X': 0.0,
      'float pole1Y': 0.0,
      'float pole1Z': 0.0,

      'float omega1': 2.4624481,
      'float omega2': 0.89865327,
      'float omega3': 0.94543356,
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
        '',
        // source
        `
        const float M_PI = 3.1415926538;
        int idx = int(n.x);
        int len = `+ numParticles + `;

        vec3 p = posXYZW[n].xyz;
        vec3 v = (vel[n]).xyz;
        float mag;
        vec3 accel;

        int leader = (idx + 1) % len;
        mag = 0.6;
        accel = mag * normalize(posXYZW[vec2(leader, n.y)].xyz);
        v += accel;

        int numInteractions = 200;
        for (int counter = 0; counter < numInteractions; counter++) {
          int i = (idx+ (counter - numInteractions/2))%len;
          if (i != idx) {
            vec3 o = posXYZW[vec2(i, n.y)].xyz;
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

        vec4 nodePosition = posXYZW[xx];
        vec4 nodeVertexColor = nodeVertexCol[];

        vVertexColor = nodeVertexColor;
        gl_Position = PMatrix * cameraWMatrix * nodePosition;
        gl_PointSize = 2.0;
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


  gpufG.setArg("PMatrix", transpose(getProyection()));
  gpufG.setArg("cameraWMatrix", transpose(new Float32Array([1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, -100.0 + Math.random(),
    0.0, 0.0, 0.0, 1.0])));
  gpufG.setArg("nodeWMatrix", transpose(new Float32Array([1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0])));

  var tick = function () {
    window.requestAnimFrame(tick);

    gpufG.processKernels();

    var gl = gpufG.getCtx();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, 770, 512);
    gl.clearColor(0.145, 0.145, 0.145, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    //gpufG.setArg("pole1X", 30);

    gpufG.processGraphic("posXYZW");
  };

  window.onload = tick;
} else {
  console.log("Error, WebGL2RenderingContext not found.");
  document.getElementById("graph-container").innerHTML = "<div class=\"card\"><h1>Error</h1><p>WebGL2RenderingContext not found.</p><p>Please use either Firefox or Chrome to view this demo.</p></div>";
}