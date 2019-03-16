if (typeof (WebGL2RenderingContext) !== "undefined") {
  var offset = 100.0;

  var arrayNodeId = [];
  var nodeId = 0;
  var arrayNodePosXYZW = [];
  var arrayNodeVertexColor = [];
  var arrayNodeDir = [];

  // initialize some nodes
  var iniNodes = (function (numNodes) {
    var addNode = function (jsonIn) {
      arrayNodeId.push(nodeId);
      arrayNodePosXYZW.push(jsonIn.position[0], jsonIn.position[1], jsonIn.position[2], 1.0);
      arrayNodeVertexColor.push(jsonIn.color[0], jsonIn.color[1], jsonIn.color[2], 1.0);

      var x = Math.random(); var y = Math.random(); var z = Math.random();
      arrayNodeDir.push(x, y, z, 255);

      nodeId++;
    };

    for (var n = 0; n < numNodes; n++) {
      var x = -(offset / 2) + (Math.random() * offset);
      var y = -(offset / 2) + (Math.random() * offset);
      var z = -(offset / 2) + (Math.random() * offset);

      var node = addNode({
        "position": [x, y, z],
        "color": [Math.random(), Math.random(), Math.random()]
      });
    }
  })(100000); // 100K

  pole_code = function () {
    return `
      float offset;vec3 polePos; vec3 cc;float distanceToPole;

      polePos = vec3(pole1X,pole1Y,pole1Z);
      offset = ` + offset.toFixed(20) + `;

      distanceToPole = 1.0-sqrt(length(vec3(polePos-currentPos)/offset));

      vec3 vecN = ((vec3(polePos-currentPos)-(-1.0))/(1.0-(-1.0)) - 0.5 ) *2.0;
      cc = vecN*distanceToPole;

      currentDir = clamp(currentDir+(cc*0.001),-1.0,1.0);
    `;
  };

  var gpufG = new gpufor(document.getElementById("graph"), // target canvas

    // VALUES
    {
      "float4* posXYZW": arrayNodePosXYZW,
      "float4* dir": arrayNodeDir,
      "float*attr nodeId": arrayNodeId,
      "float4*attr nodeVertexCol": arrayNodeVertexColor,
      "mat4 PMatrix": transpose(getProyection()),
      "mat4 cameraWMatrix": transpose(new Float32Array([1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, -100.0,
        0.0, 0.0, 0.0, 1.0])),
      "mat4 nodeWMatrix": transpose(new Float32Array([1.0, 0.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 0.0,
        0.0, 0.0, 1.0, 0.0,
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

    // KERNEL PROGRAM 1 (update "dir" & "posXYZW" in return instrucction)
    {
      "type": "KERNEL",
      "name": "PARTICLE_KERNEL",
      "viewSource": false,
      "config": ["n", ["dir", "posXYZW"],
        // head
        '',
        // source
        `vec4 dirA = dir[n];
        vec3 currentDir = vec3(dirA.x,dirA.y,dirA.z);
        vec3 currentPos = posXYZW[n].xyz;` +
        pole_code() +
        `vec3 newDir = currentDir*0.995;
        return [vec4(newDir,1.0), vec4(currentPos,1.0)+vec4(newDir,0.0)];`],
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

        mat4 nodepos = nodeWMatrix;
        nodepos[3][0] = nodePosition.x;
        nodepos[3][1] = nodePosition.y;
        nodepos[3][2] = nodePosition.z;

        vVertexColor = nodeVertexColor;
        gl_Position = PMatrix * cameraWMatrix * nodepos * vec4(1.0, 1.0, 1.0, 1.0);
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