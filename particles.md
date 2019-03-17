<head>
  <script src="/assets/js/scene_utils.js"></script>
  <script src="/assets/js/WebCLGL.min.js"></script>
</head>

<!-- <div class="card" style="text-align: center; padding-bottom: 1px; padding-top: 15px;" markdown="1">

# Particle Physics Showcase
[Back to Homepage](/)

</div> -->

<div id="graph-container" class="canvas-container">
  <canvas id="graph" class="canvas-card"></canvas>
</div>

<script src="/assets/js/particle_demo.js"></script>

<div class="card" markdown="1">

## About

*Browsers other than Firefox or Chrome may not be supported.*

This particle physics simulation shows what it would look like if particles interacted with sinusoidal forces. Each particle experiences:
1. Three sinusoidal forces acting on 200 adjacent particles (it's too expensive to compute with every other particle, plus a smaller number encourages the chaining effect). Each sinusoidal force gradually changes its phase and frequency over time.
2. A "follow the leader" force attracting it to another chosen particle. This helps form chains.
3. A strong friction effect that forces the particles into low energy states, causing stronger patterns.
4. A gravitational attraction to the center.
5. A rotational force. Each particle is a member of one of three groups, and each of the three groups has a different rotational axis.

</div>