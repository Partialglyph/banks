/* Question-type templates: the same question with fresh numbers.
 *
 * Each entry is keyed by the id of the bank question it is modelled on and has
 *   gen(R)    -> parameters, drawn from the seeded random function R (retry until "nice")
 *   q(p)      -> question paragraphs
 *   a(p)      -> markscheme paragraphs (same mark total as the original)
 *   check(p)  -> true when the stated answer really solves the question (used by the stress test)
 * Paragraphs use the same light markup as the .md files: $...$ math, **[n]** marks, {M1} badges.
 */
(function () {
  'use strict';
  var L = String.raw;

  // ---------- random + number helpers
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ri(R, a, b) { return a + Math.floor(R() * (b - a + 1)); }
  function nz(R, a, b) { var v; do v = ri(R, a, b); while (v === 0); return v; }
  function pick(R, arr) { return arr[Math.floor(R() * arr.length)]; }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = b; b = a % b; a = t; } return a || 1; }
  function near(a, b) { return Math.abs(a - b) < 1e-7 * Math.max(1, Math.abs(a), Math.abs(b)); }
  function choose(n, k) { var r = 1; for (var i = 1; i <= k; i++) r = r * (n - k + i) / i; return Math.round(r); }
  function num(x, dp) { return String(+x.toFixed(dp == null ? 3 : dp)); }
  function sf(x, s) { return String(+x.toPrecision(s || 3)); }

  // ---------- LaTeX formatting helpers
  function fr(n, d, big) {                      // simplified fraction n/d
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d); n /= g; d /= g;
    if (d === 1) return String(n);
    return (n < 0 ? '-' : '') + (big ? '\\dfrac{' : '\\tfrac{') + Math.abs(n) + '}{' + d + '}';
  }
  function surd(n) { var k = 1, r = n; for (var i = 2; i * i <= r; i++) while (r % (i * i) === 0) { r /= i * i; k *= i; } return { k: k, r: r }; }
  function sq(n) { var s = surd(n); return s.r === 1 ? String(s.k) : (s.k === 1 ? '' : s.k) + '\\sqrt{' + s.r + '}'; }
  function surdFrac(cn, cd, rad, big) {          // (cn/cd) * sqrt(rad), simplified
    var s = surd(rad); cn *= s.k;
    if (cd < 0) { cn = -cn; cd = -cd; }
    var g = gcd(cn, cd); cn /= g; cd /= g;
    var root = s.r === 1 ? '' : '\\sqrt{' + s.r + '}';
    var top = (Math.abs(cn) === 1 && root ? '' : String(Math.abs(cn))) + root;
    var sign = cn < 0 ? '-' : '';
    return cd === 1 ? sign + top : sign + (big ? '\\dfrac{' : '\\tfrac{') + top + '}{' + cd + '}';
  }
  function frc(n, d) { var s = fr(n, d); return s === '1' ? '' : s === '-1' ? '-' : s; }
  function signed(k) { return k === 0 ? '' : k < 0 ? '- ' + (-k) : '+ ' + k; }
  function lin(v, k) { return k === 0 ? v : v + ' ' + signed(k); }
  function coef(a) { return a === 1 ? '' : a === -1 ? '-' : String(a); }
  function poly(cs, v) {                         // coefficients, highest power first
    v = v || 'x';
    var deg = cs.length - 1, out = '';
    cs.forEach(function (c, i) {
      var p = deg - i; if (!c) return;
      var a = Math.abs(c);
      var term = (a === 1 && p > 0 ? '' : String(a)) + (p > 1 ? v + '^' + p : p === 1 ? v : '');
      out += out ? (c < 0 ? ' - ' : ' + ') + term : (c < 0 ? '-' : '') + term;
    });
    return out || '0';
  }
  function par(n) { return n < 0 ? '(' + n + ')' : String(n); }
  function piFrac(n, d) {                        // n*pi/d
    var g = gcd(n, d); n /= g; d /= g;
    var top = (Math.abs(n) === 1 ? '' : Math.abs(n)) + '\\pi';
    return (n < 0 ? '-' : '') + (d === 1 ? top : '\\tfrac{' + top + '}{' + d + '}');
  }
  var ORD = { 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth' };
  function retry(R, make) { for (var i = 0; i < 2000; i++) { var p = make(R); if (p) return p; } throw new Error('template could not find nice numbers'); }

  // inequality helpers: op is one of ">=", "<=", ">", "<"
  var OPS = { '>=': '\\ge', '<=': '\\le', '>': '>', '<': '<' };
  function holds(v, op) { return op === '>=' ? v >= -1e-9 : op === '<=' ? v <= 1e-9 : op === '>' ? v > 1e-9 : v < -1e-9; }
  function ineqCheck(f, op, inSet) {
    for (var x = -20; x <= 20; x += 0.125) if (holds(f(x), op) !== inSet(x)) return false;
    return true;
  }
  // set where (x - r1)(x - r2) op 0, r1 < r2, as interval notation + membership test
  function quadSet(r1, r2, op, a, b) {
    a = a || r1; b = b || r2;
    var out = op === '>=' || op === '>', closed = op.length === 2;
    var tex = out
      ? L`(-\infty, ${a}` + (closed ? ']' : ')') + L` \cup ` + (closed ? '[' : '(') + L`${b}, \infty)`
      : (closed ? '[' : '(') + a + ', ' + b + (closed ? ']' : ')');
    return {
      tex: tex,
      has: function (x) {
        if (out) return closed ? x <= r1 + 1e-9 || x >= r2 - 1e-9 : x < r1 - 1e-9 || x > r2 + 1e-9;
        return closed ? x >= r1 - 1e-9 && x <= r2 + 1e-9 : x > r1 + 1e-9 && x < r2 - 1e-9;
      }
    };
  }

  // exact trig values
  var EXACT = [[0, '0'], [0.5, L`\tfrac{1}{2}`], [Math.SQRT2 / 2, L`\tfrac{\sqrt{2}}{2}`], [Math.sqrt(3) / 2, L`\tfrac{\sqrt{3}}{2}`],
    [1, '1'], [Math.sqrt(3), L`\sqrt{3}`], [Math.sqrt(3) / 3, L`\tfrac{\sqrt{3}}{3}`]];
  function exactTex(v) {
    for (var i = 0; i < EXACT.length; i++) {
      if (near(v, EXACT[i][0])) return EXACT[i][1];
      if (near(v, -EXACT[i][0])) return '-' + EXACT[i][1];
    }
    return null;
  }

  var T = {};

  // ======================= GRADE 11 =======================

  // Quadratic inequality
  T.c1p2q1 = {
    gen: function (R) {
      return retry(R, function (R) {
        var r1 = nz(R, -9, 9), r2 = nz(R, -9, 9);
        if (r1 === r2) return null;
        return { r1: Math.min(r1, r2), r2: Math.max(r1, r2), op: pick(R, ['>=', '<=', '>', '<']) };
      });
    },
    q: function (p) {
      return [L`Solve $${poly([1, -(p.r1 + p.r2), p.r1 * p.r2])} ${OPS[p.op]} 0$. Express your answer using interval notation. **[5]**`];
    },
    a: function (p) {
      var s = quadSet(p.r1, p.r2, p.op), out = p.op[0] === '>';
      return [
        L`$(${lin('x', -p.r1)})(${lin('x', -p.r2)}) ${OPS[p.op]} 0$ {M1}`,
        L`Roots $x = ${p.r1}$, $x = ${p.r2}$ {A1}`,
        'Upward parabola, so it is ' + (out ? 'positive outside' : 'negative between') + ' the roots {M1}',
        L`$x \in ${s.tex}$ {A1}{A1}`
      ];
    },
    check: function (p) {
      var s = quadSet(p.r1, p.r2, p.op);
      return ineqCheck(function (x) { return x * x - (p.r1 + p.r2) * x + p.r1 * p.r2; }, p.op, s.has);
    }
  };

  // Arithmetic sequence from u_k and S_n
  T.c1p2q2 = {
    gen: function (R) {
      return retry(R, function (R) {
        var d = pick(R, [-2, -1.5, -1, -0.5, 0.5, 1, 1.5, 2]), a = ri(R, -10, 15), k = ri(R, 4, 6), n = pick(R, [10, 12, 16]);
        var S = n / 2 * (2 * a + (n - 1) * d);
        if (S === 0) return null;
        return { a: a, d: d, k: k, n: n, uk: a + (k - 1) * d, S: S };
      });
    },
    q: function (p) {
      return [L`The ${ORD[p.k]} term of an arithmetic sequence is equal to ${num(p.uk)} and the sum of the first ${p.n} terms is ${num(p.S)}. Find the first term and the common difference. **[6]**`];
    },
    a: function (p) {
      var rhs = 2 * p.S / p.n;
      return [
        L`$u_${p.k} = a + ${p.k - 1}d = ${num(p.uk)}$ {M1}`,
        L`$S_{${p.n}} = \dfrac{${p.n}}{2}(2a + ${p.n - 1}d) = ${num(p.S)} \Rightarrow 2a + ${p.n - 1}d = ${num(rhs)}$ {M1}{A1}`,
        L`Substituting $a = ${num(p.uk)} - ${p.k - 1}d$: $${poly([p.n - 1 - 2 * (p.k - 1), 2 * p.uk], 'd')} = ${num(rhs)}$ {M1}`,
        L`$d = ${num(p.d)}$ {A1}, $a = ${num(p.a)}$ {A1}`
      ];
    },
    check: function (p) {
      var a = p.a, d = p.d;
      return near(a + (p.k - 1) * d, p.uk) && near(p.n / 2 * (2 * a + (p.n - 1) * d), p.S);
    }
  };

  // Completing the square
  T.c1p2q3 = {
    gen: function (R) { return { a: pick(R, [2, 3, 4, -2, -3]), h: nz(R, -5, 5), k: ri(R, -15, 15) }; },
    q: function (p) {
      var B = -2 * p.a * p.h, C = p.a * p.h * p.h + p.k;
      return [
        L`Consider the function $f(x) = ${poly([p.a, B, C])}$.`,
        L`(a) Write $f(x)$ in the form $f(x) = a(x-h)^2 + k$. **[4]**`,
        L`(b) Write down the coordinates of the vertex. **[2]**`
      ];
    },
    a: function (p) {
      var C = p.a * p.h * p.h + p.k, sqr = L`(${lin('x', -p.h)})^2`;
      return [
        L`(a) $f(x) = ${p.a}(${poly([1, -2 * p.h, 0])}) ${signed(C)}$ {M1}`,
        L`$= ${p.a}\left[${sqr} - ${p.h * p.h}\right] ${signed(C)}$ {A1}`,
        L`$= ${p.a}${sqr} ${signed(p.k)}$ {A1}{A1}`,
        L`(b) $(${p.h}, ${p.k})$ {A1}{A1}`
      ];
    },
    check: function (p) {
      var B = -2 * p.a * p.h, C = p.a * p.h * p.h + p.k;
      return [-3, 0.5, 2, 7].every(function (x) { return near(p.a * x * x + B * x + C, p.a * (x - p.h) * (x - p.h) + p.k); });
    }
  };

  // Radical equation with an extraneous root
  T.c1p2q5 = {
    gen: function (R) {
      return retry(R, function (R) {
        var t = pick(R, [2, 2, 3]), n = ri(R, 3, 10), X = n + t, m = X - t * t;
        if (m < 1) return null;
        return { n: n, m: m, X: X, s: 2 * n + 1 - X };
      });
    },
    q: function (p) { return [L`Solve $x - \sqrt{${lin('x', -p.m)}} = ${p.n}$. **[5]**`]; },
    a: function (p) {
      var inside = p.s - p.m;
      var why = inside < 0
        ? L`Check: $x = ${p.s}$ is outside the domain ($x \ge ${p.m}$), so reject it {R1}`
        : L`Check: $x = ${p.s}$ gives $\sqrt{${inside}} = ${num(Math.sqrt(inside))}$ but $${p.s} - ${p.n} = ${p.s - p.n}$, so reject it {R1}`;
      return [
        L`$\sqrt{${lin('x', -p.m)}} = ${lin('x', -p.n)} \Rightarrow ${lin('x', -p.m)} = ${poly([1, -2 * p.n, p.n * p.n])}$ {M1}`,
        L`$${poly([1, -(2 * p.n + 1), p.n * p.n + p.m])} = 0$ {A1}`,
        L`$(${lin('x', -p.s)})(${lin('x', -p.X)}) = 0$ {A1}`,
        why,
        L`$x = ${p.X}$ {A1}`
      ];
    },
    check: function (p) {
      var ok = p.X - p.m >= 0 && near(p.X - Math.sqrt(p.X - p.m), p.n);
      var bad = p.s - p.m < 0 || !near(p.s - Math.sqrt(p.s - p.m), p.n);
      return ok && bad && near(p.s + p.X, 2 * p.n + 1) && near(p.s * p.X, p.n * p.n + p.m);
    }
  };

  // Quadratic from intercepts / vertex
  T.c1p3q1 = {
    gen: function (R) {
      return retry(R, function (R) {
        var r = nz(R, -6, 8), s = nz(R, -6, 8), a = nz(R, -3, 3), x0 = ri(R, -4, 6);
        if (r === s || x0 === r || x0 === s) return null;
        var h = nz(R, -4, 4), k = ri(R, -6, 6), b = nz(R, -3, 3);
        return { r: Math.min(r, s), s: Math.max(r, s), a: a, x0: x0, y0: a * (x0 - r) * (x0 - s), h: h, k: k, b: b, Y: b * h * h + k };
      });
    },
    q: function (p) {
      return [
        'Find (in any form) the equation of the quadratic whose graph: **[6]**',
        L`(a) has $x$-intercepts at $x = ${p.r}, ${p.s}$ and passes through the point $(${p.x0}, ${p.y0})$;`,
        L`(b) has vertex $(${p.h}, ${p.k})$ and has $y$-intercept $y = ${p.Y}$.`
      ];
    },
    a: function (p) {
      var f1 = L`(${lin('x', -p.r)})(${lin('x', -p.s)})`, sq2 = L`(${lin('x', -p.h)})^2`;
      return [
        L`(a) $y = a${f1}$ {M1}; $${p.y0} = a(${p.x0 - p.r})(${p.x0 - p.s}) \Rightarrow a = ${p.a}$ {A1}`,
        L`$y = ${coef(p.a)}${f1}$ {A1}`,
        L`(b) $y = a${sq2} ${signed(p.k)}$ {M1}; $${p.Y} = ${p.h * p.h}a ${signed(p.k)} \Rightarrow a = ${p.b}$ {A1}`,
        L`$y = ${coef(p.b)}${sq2} ${signed(p.k)}$ {A1}`
      ];
    },
    check: function (p) {
      var f = function (x) { return p.a * (x - p.r) * (x - p.s); }, g = function (x) { return p.b * (x - p.h) * (x - p.h) + p.k; };
      return near(f(p.r), 0) && near(f(p.s), 0) && near(f(p.x0), p.y0) && near(g(0), p.Y);
    }
  };

  // Arithmetic sequence from u2 and u4
  T.c1p3q2 = {
    gen: function (R) { var a = ri(R, -10, 12), d = nz(R, -6, 8); return { a: a, d: d }; },
    q: function (p) {
      return [
        L`The second term of an arithmetic sequence is ${p.a + p.d} and the fourth term is ${p.a + 3 * p.d}.`,
        '(a) Find the value of the common difference. **[2]**',
        L`(b) Find an expression for $u_n$, the $n$th term. **[2]**`
      ];
    },
    a: function (p) {
      return [
        L`(a) $a + d = ${p.a + p.d}$, $a + 3d = ${p.a + 3 * p.d}$ {M1}`,
        L`$d = ${p.d}$ {A1}`,
        L`(b) $a = ${p.a}$, so $u_n = ${p.a} + ${par(p.d)}(n - 1)$ {M1}`,
        L`$u_n = ${poly([p.d, p.a - p.d], 'n')}$ {A1}`
      ];
    },
    check: function (p) { return near((p.a + 3 * p.d - (p.a + p.d)) / 2, p.d); }
  };

  // Three quadratic inequalities
  T.c1p3q3 = {
    gen: function (R) {
      return retry(R, function (R) {
        var c = nz(R, -9, 9), r = ri(R, 1, 6), s = ri(R, 1, 9), pp = pick(R, [1, 3, 5, 7]), q = ri(R, 1, 6);
        if (r >= s || pp === 2 * q) return null;
        return { c: c, opA: pick(R, ['>=', '<=']), r: r, s: s, opB: pick(R, ['<=', '>=']), pp: pp, q: q };
      });
    },
    q: function (p) {
      return [
        'Solve the following inequalities: **[6]**',
        L`(a) $x^2 ${OPS[p.opA]} ${coef(p.c)}x$`,
        L`(b) $${poly([1, -(p.r + p.s), p.r * p.s])} ${OPS[p.opB]} 0$`,
        L`(c) $2x^2 + ${p.pp * p.q} > ${p.pp + 2 * p.q}x$`
      ];
    },
    a: function (p) {
      var A = quadSet(Math.min(0, p.c), Math.max(0, p.c), p.opA), B = quadSet(p.r, p.s, p.opB);
      var lo = Math.min(p.pp / 2, p.q), hi = Math.max(p.pp / 2, p.q);
      var C = quadSet(lo, hi, '>', lo === p.q ? p.q : fr(p.pp, 2), hi === p.q ? p.q : fr(p.pp, 2));
      return [
        L`(a) $x(${lin('x', -p.c)}) ${OPS[p.opA]} 0 \Rightarrow x \in ${A.tex}$ {M1}{A1}`,
        L`(b) $(${lin('x', -p.r)})(${lin('x', -p.s)}) ${OPS[p.opB]} 0 \Rightarrow x \in ${B.tex}$ {M1}{A1}`,
        L`(c) $2x^2 - ${p.pp + 2 * p.q}x + ${p.pp * p.q} > 0 \Rightarrow (2x - ${p.pp})(${lin('x', -p.q)}) > 0$ {M1}`,
        L`$x \in ${C.tex}$ {A1}`
      ];
    },
    check: function (p) {
      var A = quadSet(Math.min(0, p.c), Math.max(0, p.c), p.opA), B = quadSet(p.r, p.s, p.opB);
      var C = quadSet(Math.min(p.pp / 2, p.q), Math.max(p.pp / 2, p.q), '>');
      return ineqCheck(function (x) { return x * x - p.c * x; }, p.opA, A.has) &&
        ineqCheck(function (x) { return (x - p.r) * (x - p.s); }, p.opB, B.has) &&
        ineqCheck(function (x) { return 2 * x * x + p.pp * p.q - (p.pp + 2 * p.q) * x; }, '>', C.has);
    }
  };

  // Fencing against a house
  T.c1p3q5 = {
    gen: function (R) { return { F: pick(R, [40, 60, 80, 100, 120, 160, 200, 240]), who: pick(R, ['Bob', 'Ava', 'Sam', 'Mia', 'Leo']) }; },
    q: function (p) {
      return [L`If ${p.who} wants to build a garden with ${p.F} m of fencing, find the dimensions of the garden that will maximize the area when one side of the garden is along the house. **[6]**`];
    },
    a: function (p) {
      var x = p.F / 4, y = p.F / 2;
      return [
        L`Let the two sides perpendicular to the house be $x$ and the side parallel be $y$: $2x + y = ${p.F}$ {M1}`,
        L`$A = x(${p.F} - 2x) = ${p.F}x - 2x^2$ {M1}{A1}`,
        L`Maximum at $x = \dfrac{-${p.F}}{2(-2)} = ${x}$ {M1}`,
        L`$x = ${x}$ m, $y = ${y}$ m {A1}`,
        L`Dimensions $${x}\ \text{m} \times ${y}\ \text{m}$ (maximum area $${x * y}\ \text{m}^2$) {A1}`
      ];
    },
    check: function (p) {
      var best = 0, bx = 0;
      for (var x = 0; x <= p.F / 2; x += 0.5) { var A = x * (p.F - 2 * x); if (A > best) { best = A; bx = x; } }
      return near(bx, p.F / 4);
    }
  };

  // Composite function with k^2
  T.c2p1q5 = {
    gen: function (R) { var a = ri(R, 1, 6), b = ri(R, -3, 9), k = ri(R, 1, 6); return { a: a, b: b, k: k, v: (b - a) * (b - a) + k * k }; },
    q: function (p) {
      return [
        L`Consider the functions $f(x) = ${lin('x', -p.a)}$ and $g(x) = x^2 + k^2$, where $k$ is a real constant.`,
        L`(a) Write down an expression for $(g \circ f)(x)$. **[2]**`,
        L`(b) Given that $(g \circ f)(${p.b}) = ${p.v}$, find the possible values of $k$. **[3]**`
      ];
    },
    a: function (p) {
      return [
        L`(a) $(g \circ f)(x) = g(${lin('x', -p.a)})$ {M1}`,
        L`$= (${lin('x', -p.a)})^2 + k^2$ {A1}`,
        L`(b) $(${p.b} - ${p.a})^2 + k^2 = ${p.v}$ {M1}`,
        L`$k^2 = ${p.k * p.k}$ {A1}`,
        L`$k = \pm ${p.k}$ {A1}`
      ];
    },
    check: function (p) { return near((p.b - p.a) * (p.b - p.a) + p.k * p.k, p.v); }
  };

  // Exponential equation with a common base
  var BASES = [[3, 9, 27, 2, 3], [2, 4, 8, 2, 3], [2, 8, 16, 3, 4], [5, 25, 125, 2, 3], [2, 4, 32, 2, 5], [3, 27, 9, 3, 2], [2, 16, 8, 4, 3]];
  T.c3p1q1 = {
    gen: function (R) { var b = pick(R, BASES); return { B: b[0], P: b[1], Q: b[2], m: b[3], n: b[4], c: ri(R, 1, 4), d: ri(R, 1, 3) }; },
    q: function (p) { return [L`Solve the equation $${p.P}^x = ${p.Q}^{${p.c} - ${coef(p.d)}x}$. **[5]**`]; },
    a: function (p) {
      return [
        L`$${p.B}^{${p.m}x} = ${p.B}^{${p.n}(${p.c} - ${coef(p.d)}x)}$ {M1}{A1}`,
        L`$${p.m}x = ${p.n * p.c} - ${p.n * p.d}x$ {M1}{A1}`,
        L`$x = ${fr(p.n * p.c, p.m + p.n * p.d)}$ {A1}`
      ];
    },
    check: function (p) { var x = p.n * p.c / (p.m + p.n * p.d); return near(x * Math.log(p.P), (p.c - p.d * x) * Math.log(p.Q)); }
  };

  // Log equation leading to a Pythagorean triple
  var TRIPLES = [[3, 4, 5], [4, 3, 5], [5, 12, 13], [12, 5, 13], [6, 8, 10], [8, 6, 10], [8, 15, 17], [15, 8, 17]];
  T.c3p1q4 = {
    gen: function (R) { var t = pick(R, TRIPLES); return { b: t[0], k: t[1], X: t[2] }; },
    q: function (p) { return [L`Solve the equation $\log_{${p.b}}(x + ${p.k}) = 2 - \log_{${p.b}}(x - ${p.k})$. **[5]**`]; },
    a: function (p) {
      return [
        L`$\log_{${p.b}}(x + ${p.k}) + \log_{${p.b}}(x - ${p.k}) = 2$ {M1}`,
        L`$\log_{${p.b}}(x^2 - ${p.k * p.k}) = 2 \Rightarrow x^2 - ${p.k * p.k} = ${p.b * p.b}$ {M1}{A1}`,
        L`$x = \pm ${p.X}$ {A1}; $x = ${p.X}$ (as $x > ${p.k}$) {A1}`
      ];
    },
    check: function (p) { return near(Math.log(p.X + p.k) / Math.log(p.b), 2 - Math.log(p.X - p.k) / Math.log(p.b)); }
  };

  // Arithmetic sequence of logarithms
  T.c3p1q6 = {
    gen: function (R) {
      return retry(R, function (R) {
        var b = pick(R, [2, 3, 5]), n = ri(R, 7, 15), e = ri(R, 1, b === 5 ? 3 : 4);
        if ((n - 1 + e) % 2) return null;
        return { b: b, n: n, e: e, j: (n - 1 + e) / 2 };
      });
    },
    q: function (p) {
      return [L`An arithmetic sequence has the first term $\ln a$ and a common difference of $\ln ${p.b}$. The ${p.n}th term in the sequence is $${p.j}\ln ${p.b * p.b}$. Find the value of $a$. **[6]**`];
    },
    a: function (p) {
      return [
        L`$u_{${p.n}} = \ln a + ${p.n - 1}\ln ${p.b}$ {M1}{A1}`,
        L`$${p.j}\ln ${p.b * p.b} = ${2 * p.j}\ln ${p.b}$ {A1}`,
        L`$\ln a = ${2 * p.j}\ln ${p.b} - ${p.n - 1}\ln ${p.b} = ${p.e}\ln ${p.b}$ {M1}{A1}`,
        L`$a = ${p.b}^{${p.e}} = ${Math.pow(p.b, p.e)}$ {A1}`
      ];
    },
    check: function (p) { return near(Math.log(Math.pow(p.b, p.e)) + (p.n - 1) * Math.log(p.b), p.j * Math.log(p.b * p.b)); }
  };

  // 2 ln x = ln P + Q
  T.c3p1q7 = {
    gen: function (R) { return { p: ri(R, 2, 7), q: ri(R, 1, 3) }; },
    q: function (p) {
      return [L`Solve the equation $2\ln x = \ln ${p.p * p.p} + ${2 * p.q}$. Give your answer in the form $x = pe^q$, where $p, q \in \mathbb{Z}^+$. **[5]**`];
    },
    a: function (p) {
      return [
        L`$\ln x^2 = \ln ${p.p * p.p} + ${2 * p.q}$ {M1}`,
        L`$\ln x = \ln ${p.p} + ${p.q}$ {A1}`,
        L`$x = e^{\ln ${p.p} + ${p.q}}$ {M1}`,
        L`$x = ${p.p}e^{${p.q}}$, so $p = ${p.p}$ {A1} and $q = ${p.q}$ {A1}`
      ];
    },
    check: function (p) { var x = p.p * Math.exp(p.q); return near(2 * Math.log(x), Math.log(p.p * p.p) + 2 * p.q); }
  };

  // Bacteria growth model
  T.c3p2q4 = {
    gen: function (R) {
      return retry(R, function (R) {
        var r = pick(R, [1.2, 1.3, 1.4, 1.5, 1.6]), T0 = pick(R, [10, 12, 15, 20]), Rt = pick(R, [2, 2.5, 3, 4, 5]);
        var t = T0 * Math.log(Rt) / Math.log(r);
        if (Math.abs(t - Math.round(t)) < 0.05) return null;
        return { r: r, T: T0, Rt: Rt, k: Math.log(r) / T0, t: t };
      });
    },
    q: function (p) {
      return [
        L`The number of bacteria, $N$, can be modelled by the equation $N = N_0 e^{kt}$ where $N_0$ is the initial number and $t$ is measured in minutes. After ${p.T} minutes it is found that $\dfrac{N}{N_0} = ${p.r}$.`,
        L`(a) Find the value of $k$. **[3]**`,
        L`(b) Find the least whole number of minutes for which $\dfrac{N}{N_0} > ${p.Rt}$. **[4]**`
      ];
    },
    a: function (p) {
      return [
        L`(a) $${p.r} = e^{${p.T}k}$ {M1}`,
        L`$${p.T}k = \ln ${p.r}$ {A1}`,
        L`$k = ${sf(p.k)}$ (3 s.f.) {A1}`,
        L`(b) $e^{kt} > ${p.Rt} \Rightarrow t > \dfrac{\ln ${p.Rt}}{k}$ {M1}{A1}`,
        L`$t > ${num(p.t, 2)}$ {A1}`,
        L`${Math.floor(p.t) + 1} minutes {A1}`
      ];
    },
    check: function (p) {
      var m = Math.floor(p.t) + 1;
      return Math.exp(p.k * m) > p.Rt && !(Math.exp(p.k * (m - 1)) > p.Rt) && near(Math.exp(p.k * p.T), p.r);
    }
  };

  // log_{kx} M = 3
  T.c3p2q6 = {
    gen: function (R) { var k = pick(R, [2, 3]), a = pick(R, [2, 3, 4, 5, 6, 7, 9, 10]); return { k: k, a: a, M: k * k * k * a }; },
    q: function (p) { return [L`Solve $\log_{${p.k}x} ${p.M} = 3$. Leave your answer in the form $\sqrt[3]{a}$ where $a \in \mathbb{N}$. **[5]**`]; },
    a: function (p) {
      return [
        L`$(${p.k}x)^3 = ${p.M}$ {M1}{A1}`,
        L`$${p.k * p.k * p.k}x^3 = ${p.M}$ {A1}`,
        L`$x^3 = ${p.a}$ {A1}`,
        L`$x = \sqrt[3]{${p.a}}$ {A1}`
      ];
    },
    check: function (p) { var x = Math.cbrt(p.a); return near(Math.log(p.M) / Math.log(p.k * x), 3); }
  };

  // Powers of 2
  T.c3p3q2 = {
    gen: function (R) {
      return retry(R, function (R) {
        var m = ri(R, 2, 5), n = ri(R, 2, 5), pp = ri(R, 1, 3), q = ri(R, -4, 4), r = ri(R, 1, 3), s = ri(R, -4, 4);
        if (m === n || m * pp === n * r) return null;
        return { m: m, n: n, pp: pp, q: q, r: r, s: s };
      });
    },
    q: function (p) {
      var a = Math.pow(2, p.m), b = Math.pow(2, p.n);
      return [
        L`Given that $2^m = ${a}$ and $2^n = ${b}$:`,
        L`(a) Write down the value of $m$ and $n$.`,
        L`(b) Hence or otherwise solve $${a}^{${poly([p.pp, p.q])}} = ${b}^{${poly([p.r, p.s])}}$.`
      ];
    },
    a: function (p) {
      return [
        L`(a) $m = ${p.m}$ {A1}, $n = ${p.n}$ {A1}`,
        L`(b) $2^{${p.m}(${poly([p.pp, p.q])})} = 2^{${p.n}(${poly([p.r, p.s])})}$ {M1}`,
        L`$${poly([p.m * p.pp, p.m * p.q])} = ${poly([p.n * p.r, p.n * p.s])}$ {A1}`,
        L`$x = ${fr(p.n * p.s - p.m * p.q, p.m * p.pp - p.n * p.r)}$ {A1}`
      ];
    },
    check: function (p) { var x = (p.n * p.s - p.m * p.q) / (p.m * p.pp - p.n * p.r); return near(p.m * (p.pp * x + p.q), p.n * (p.r * x + p.s)); }
  };

  // sin theta given, find cos and cos 2theta
  T.c4p1q2 = {
    gen: function (R) {
      return retry(R, function (R) {
        var c = ri(R, 3, 9), m = ri(R, 1, c - 1), n = c * c - m * m;
        if (surd(n).r === 1 || gcd(m, c) !== 1) return null;
        return { c: c, m: m, n: n };
      });
    },
    q: function (p) {
      return [
        L`Let $\sin\theta = ${surdFrac(1, p.c, p.n, true)}$, where $\theta$ is acute.`,
        L`(a) Find $\cos\theta$. **[3]**`,
        L`(b) Find $\cos 2\theta$. **[2]**`
      ];
    },
    a: function (p) {
      var c2 = p.c * p.c;
      return [
        L`(a) $\cos^2\theta = 1 - ${fr(p.n, c2)}$ {M1}`,
        L`$\cos\theta = ${fr(p.m, p.c)}$ (acute) {A1}{A1}`,
        L`(b) $\cos 2\theta = 1 - 2\sin^2\theta = 1 - ${fr(2 * p.n, c2)}$ {M1}`,
        L`$= ${fr(c2 - 2 * p.n, c2)}$ {A1}`
      ];
    },
    check: function (p) { var th = Math.asin(Math.sqrt(p.n) / p.c); return near(Math.cos(th), p.m / p.c) && near(Math.cos(2 * th), (p.c * p.c - 2 * p.n) / (p.c * p.c)); }
  };

  // Trig quadratic with one impossible factor
  var SOLS = { 'sin,1': [1, 6, 5, 6], 'sin,-1': [7, 6, 11, 6], 'cos,1': [1, 3, 5, 3], 'cos,-1': [2, 3, 4, 3] };
  T.c4p2q3 = {
    gen: function (R) { return { f: pick(R, ['sin', 'cos']), sg: pick(R, [1, -1]), k: pick(R, [2, 3, 4, 5, -2, -3]) }; },
    q: function (p) {
      var F = '\\' + p.f;
      return [L`Solve the equation $2${F}^2 x ${signed(-(p.sg + 2 * p.k))}${F} x ${signed(p.sg * p.k)} = 0$ for $0 \le x \le 2\pi$. **[5]**`];
    },
    a: function (p) {
      var F = '\\' + p.f, s = SOLS[p.f + ',' + p.sg];
      return [
        L`$(2${F} x ${signed(-p.sg)})(${F} x ${signed(-p.k)}) = 0$ {M1}{A1}`,
        L`$${F} x = ${p.k}$ has no solution {R1}`,
        L`$x = ${piFrac(s[0], s[1])}$ {A1}, $x = ${piFrac(s[2], s[3])}$ {A1}`
      ];
    },
    check: function (p) {
      var s = SOLS[p.f + ',' + p.sg], fn = Math[p.f];
      return [s[0] / s[1], s[2] / s[3]].every(function (k) {
        var v = fn(k * Math.PI);
        return near(2 * v * v - (p.sg + 2 * p.k) * v + p.sg * p.k, 0);
      });
    }
  };

  // Exact trig values
  T.c4p2q1 = {
    gen: function (R) {
      var items = [];
      while (items.length < 3) {
        var f = pick(R, ['sin', 'cos', 'tan']), d = pick(R, [2, 3, 4, 6]), n = nz(R, -7, 11);
        if (gcd(n, d) !== 1) continue;
        var v = Math[f](n * Math.PI / d);
        if (f === 'tan' && Math.abs(Math.cos(n * Math.PI / d)) < 1e-9) continue;
        if (exactTex(v) == null) continue;
        items.push({ f: f, n: n, d: d });
      }
      return { items: items };
    },
    q: function (p) {
      var L3 = ['(a)', '(b)', '(c)'];
      return ['Determine the following values exactly.', p.items.map(function (it, i) {
        return L3[i] + ' $\\' + it.f + L`\!\left(${piFrac(it.n, it.d)}\right)$ **[2]**`;
      }).join('  ')];
    },
    a: function (p) {
      return p.items.map(function (it, i) {
        var red = ((it.n % (2 * it.d)) + 2 * it.d) % (2 * it.d);
        return ['(a)', '(b)', '(c)'][i] + L` $${piFrac(it.n, it.d)}$ is coterminal with $${red === 0 ? '0' : piFrac(red, it.d)}$ {M1}, so the value is $${exactTex(Math[it.f](it.n * Math.PI / it.d))}$ {A1}`;
      });
    },
    check: function (p) { return p.items.every(function (it) { return exactTex(Math[it.f](it.n * Math.PI / it.d)) != null; }); }
  };

  // Sector in degrees
  T.c4p4q2 = {
    gen: function (R) { return { r: pick(R, [6, 8, 9, 10, 12, 15, 18, 20]), deg: pick(R, [20, 30, 36, 40, 45, 60, 72, 80, 100, 120, 135, 150]) }; },
    q: function (p) {
      return [
        L`A sector has a radius of ${p.r} cm and a central angle of $${p.deg}^\circ$.`,
        '(a) Determine the measure of the central angle in radians. **[1]**',
        '(b) Find the area of the sector. **[2]**',
        '(c) Find the perimeter of the sector. **[2]**'
      ];
    },
    a: function (p) {
      return [
        L`(a) $${p.deg}^\circ = ${piFrac(p.deg, 180)}$ {A1}`,
        L`(b) $\tfrac{1}{2}(${p.r}^2)\left(${piFrac(p.deg, 180)}\right)$ {M1}, $= ${piFrac(p.r * p.r * p.deg, 360)}\ \text{cm}^2$ {A1}`,
        L`(c) $${2 * p.r} + ${p.r}\left(${piFrac(p.deg, 180)}\right)$ {M1}, $= ${2 * p.r} + ${piFrac(p.r * p.deg, 180)}$ cm {A1}`
      ];
    },
    check: function (p) { var th = p.deg * Math.PI / 180; return near(0.5 * p.r * p.r * th, p.r * p.r * p.deg * Math.PI / 360); }
  };

  // SAS triangle with a 60 or 120 degree angle
  T.c4p3q3 = {
    gen: function (R) {
      return retry(R, function (R) {
        var a = ri(R, 2, 12), b = ri(R, 2, 12), ang = pick(R, [60, 120]);
        if (a === b) return null;
        return { a: a, b: b, ang: ang, N: a * a + b * b + (ang === 120 ? a * b : -a * b) };
      });
    },
    q: function (p) {
      return [
        L`Consider a triangle $ABC$ with $AB = ${p.a}$ cm, $BC = ${p.b}$ cm, and $\angle ABC = ${p.ang}^\circ$.`,
        '(a) Draw a diagram representing the information above. **[1]**',
        L`(b) Find the exact value of $AC$. **[2]**`,
        L`(c) Find the exact value of the area of triangle $ABC$. **[2]**`,
        L`(d) Hence, find the shortest distance from $B$ to line $AC$. **[2]**`
      ];
    },
    a: function (p) {
      var ab = p.a * p.b;
      return [
        L`(a) Triangle with $AB = ${p.a}$, $BC = ${p.b}$ and $\angle B = ${p.ang}^\circ$ marked {A1}`,
        L`(b) $AC^2 = ${p.a * p.a} + ${p.b * p.b} - 2(${p.a})(${p.b})\cos ${p.ang}^\circ$ {M1}`,
        L`$AC^2 = ${p.N}$, $AC = ${sq(p.N)}$ cm {A1}`,
        L`(c) Area $= \tfrac{1}{2}(${p.a})(${p.b})\sin ${p.ang}^\circ$ {M1}`,
        L`$= ${surdFrac(ab, 4, 3, true)}\ \text{cm}^2$ {A1}`,
        L`(d) $\tfrac{1}{2}\left(${sq(p.N)}\right)d = ${surdFrac(ab, 4, 3, true)}$ {M1}`,
        L`$d = ${surdFrac(ab, 2 * p.N, 3 * p.N, true)}$ cm {A1}`
      ];
    },
    check: function (p) {
      var A = p.ang * Math.PI / 180, ac = Math.sqrt(p.a * p.a + p.b * p.b - 2 * p.a * p.b * Math.cos(A));
      var area = 0.5 * p.a * p.b * Math.sin(A);
      return near(ac * ac, p.N) && near(area, p.a * p.b * Math.sqrt(3) / 4) && near(2 * area / ac, p.a * p.b * Math.sqrt(3 * p.N) / (2 * p.N));
    }
  };

  // Venn diagram: neither
  T['c5p1section-3q1'] = {
    gen: function (R) {
      return retry(R, function (R) {
        var a = ri(R, 20, 60), b = ri(R, 8, 40), c = ri(R, 3, Math.min(a, b) - 1);
        if (a + b - c > 95) return null;
        return { a: a, b: b, c: c };
      });
    },
    q: function (p) {
      return [L`In a survey, ${p.a}% of households contacted owned a home computer and ${p.b}% owned a home entertainment system. ${p.c}% of all households contacted owned both. What is the probability that a household will own neither?`];
    },
    a: function (p) {
      var u = p.a + p.b - p.c;
      return [L`$P(C \cup E) = ${num(p.a / 100)} + ${num(p.b / 100)} - ${num(p.c / 100)} = ${num(u / 100)}$, so $P(\text{neither}) = ${num(1 - u / 100)}$ {A1}`];
    },
    check: function (p) { return p.c <= Math.min(p.a, p.b) && p.a + p.b - p.c <= 100; }
  };

  // Two bags and a coin
  T['c5p1section-4q3'] = {
    gen: function (R) {
      return retry(R, function (R) {
        var n1 = pick(R, [8, 10, 12]), n2 = pick(R, [8, 10, 12]), w1 = ri(R, 1, n1 - 1), w2 = ri(R, 1, n2 - 1);
        if (w1 * n2 === w2 * n1) return null;
        return { n1: n1, n2: n2, w1: w1, w2: w2 };
      });
    },
    q: function (p) {
      return [
        L`One bag contains ${p.w1} white balls and ${p.n1 - p.w1} black balls. Another bag contains ${p.w2} white balls and ${p.n2 - p.w2} black balls. A coin is tossed to select a bag, then a ball is randomly selected from that bag.`,
        '(a) What is the probability that a white ball will be drawn?',
        '(b) Suppose a white ball was drawn. What is the probability that it came from the first bag?'
      ];
    },
    a: function (p) {
      var num1 = p.w1 * p.n2, num2 = p.w2 * p.n1, den = 2 * p.n1 * p.n2;
      return [
        L`(a) $\tfrac{1}{2}\left(${fr(p.w1, p.n1)}\right) + \tfrac{1}{2}\left(${fr(p.w2, p.n2)}\right) = ${fr(num1 + num2, den)}$ {A1}`,
        L`(b) $\dfrac{\tfrac{1}{2} \cdot ${fr(p.w1, p.n1)}}{${fr(num1 + num2, den)}} = ${fr(num1, num1 + num2)}$ {A1}`
      ];
    },
    check: function (p) {
      var pw = 0.5 * p.w1 / p.n1 + 0.5 * p.w2 / p.n2;
      return near(pw, (p.w1 * p.n2 + p.w2 * p.n1) / (2 * p.n1 * p.n2)) && near(0.5 * p.w1 / p.n1 / pw, p.w1 * p.n2 / (p.w1 * p.n2 + p.w2 * p.n1));
    }
  };

  // Binomial: k hits out of n
  T['c5p1section-6q2'] = {
    gen: function (R) { var n = pick(R, [8, 10, 12]); return { pr: pick(R, [0.6, 0.7, 0.75, 0.8, 0.85, 0.9]), n: n, k: n - pick(R, [1, 2]) }; },
    q: function (p) {
      return [L`Suppose an archer could hit a target ${Math.round(p.pr * 100)}% of the time. What is the probability that the archer would hit the target ${p.k} times out of ${p.n}?`];
    },
    a: function (p) {
      var v = choose(p.n, p.k) * Math.pow(p.pr, p.k) * Math.pow(1 - p.pr, p.n - p.k);
      return [L`$\binom{${p.n}}{${p.k}}(${p.pr})^{${p.k}}(${num(1 - p.pr, 2)})^{${p.n - p.k}} \approx ${sf(v)}$ {A1}`];
    },
    check: function (p) {
      var tot = 0;
      for (var i = 0; i <= p.n; i++) tot += choose(p.n, i) * Math.pow(p.pr, i) * Math.pow(1 - p.pr, p.n - i);
      return near(tot, 1);
    }
  };

  // ======================= GRADE 12 =======================

  // Limit by factorising
  T.g12c1p1q1 = {
    gen: function (R) {
      return retry(R, function (R) {
        var a = nz(R, -5, 6), b = ri(R, -6, 6), c = ri(R, -6, 6);
        if (a === b || a === c || b === c) return null;
        return { a: a, b: b, c: c };
      });
    },
    q: function (p) {
      return [L`Evaluate $\displaystyle\lim_{x \to ${p.a}} \frac{${poly([1, -(p.a + p.b), p.a * p.b])}}{${poly([1, -(p.a + p.c), p.a * p.c])}}$. **[4]**`];
    },
    a: function (p) {
      return [
        L`$\dfrac{(${lin('x', -p.a)})(${lin('x', -p.b)})}{(${lin('x', -p.a)})(${lin('x', -p.c)})}$ {M1}{A1}`,
        L`$= \dfrac{${lin('x', -p.b)}}{${lin('x', -p.c)}}$ for $x \ne ${p.a}$ {A1}`,
        L`Limit $= ${fr(p.a - p.b, p.a - p.c)}$ {A1}`
      ];
    },
    check: function (p) {
      var x = p.a + 1e-6, f = (x * x - (p.a + p.b) * x + p.a * p.b) / (x * x - (p.a + p.c) * x + p.a * p.c);
      return Math.abs(f - (p.a - p.b) / (p.a - p.c)) < 1e-4;
    }
  };

  // Difference of squares and conjugate limits
  T.g12c1p6q2 = {
    gen: function (R) { return { a: ri(R, 2, 12), b: ri(R, 2, 9) }; },
    q: function (p) {
      return [
        'Evaluate the following limits. **[6]**',
        L`(a) $\displaystyle\lim_{x \to ${p.a}} \frac{x^2 - ${p.a * p.a}}{x - ${p.a}}$`,
        L`(b) $\displaystyle\lim_{x \to ${p.b * p.b}} \frac{\sqrt{x} - ${p.b}}{x - ${p.b * p.b}}$`
      ];
    },
    a: function (p) {
      return [
        L`(a) $\dfrac{(x - ${p.a})(x + ${p.a})}{x - ${p.a}}$ {M1}`,
        L`$= x + ${p.a}$ {A1}`,
        L`Limit $= ${2 * p.a}$ {A1}`,
        L`(b) $\dfrac{\sqrt{x} - ${p.b}}{(\sqrt{x} - ${p.b})(\sqrt{x} + ${p.b})}$ {M1}`,
        L`$= \dfrac{1}{\sqrt{x} + ${p.b}}$ {A1}`,
        L`Limit $= ${fr(1, 2 * p.b)}$ {A1}`
      ];
    },
    check: function (p) {
      var x = p.a + 1e-6, y = p.b * p.b + 1e-6;
      return Math.abs((x * x - p.a * p.a) / (x - p.a) - 2 * p.a) < 1e-4 && Math.abs((Math.sqrt(y) - p.b) / (y - p.b * p.b) - 1 / (2 * p.b)) < 1e-4;
    }
  };

  // Limit at infinity with a square root
  T.g12c1p6q3 = {
    gen: function (R) { return { p: ri(R, 1, 6), q: nz(R, -9, 9), r: ri(R, 2, 5), s: nz(R, -9, 9), t: nz(R, -9, 9) }; },
    q: function (p) {
      return [L`Evaluate $\displaystyle\lim_{x \to \infty} \frac{${poly([p.p, p.q])}}{\sqrt{${poly([p.r * p.r, p.s, p.t])}}}$. **[4]**`];
    },
    a: function (p) {
      return [
        L`Divide the numerator and denominator by $x$ (with $x > 0$, $\sqrt{x^2} = x$) {M1}`,
        L`$\dfrac{${p.p} ${signed(p.q)}/x}{\sqrt{${p.r * p.r} ${signed(p.s)}/x ${signed(p.t)}/x^2}}$ {A1}`,
        L`$\to \dfrac{${p.p}}{\sqrt{${p.r * p.r}}}$ {A1}`,
        L`$= ${fr(p.p, p.r)}$ {A1}`
      ];
    },
    check: function (p) {
      var x = 1e7, f = (p.p * x + p.q) / Math.sqrt(p.r * p.r * x * x + p.s * x + p.t);
      return Math.abs(f - p.p / p.r) < 1e-5;
    }
  };

  // Tangent line fixes p and c
  T.g12c1p1q6 = {
    gen: function (R) { return { a: pick(R, [2, 3, 4, -2]), b: nz(R, -6, 6), pt: nz(R, -3, 4), c: ri(R, -10, 10) }; },
    q: function (p) {
      var m = 2 * p.a * p.pt + p.b, Y = p.a * p.pt * p.pt + p.b * p.pt + p.c;
      return [L`Consider the function $f(x) = ${poly([p.a, p.b, 0])} + c$. The equation of the tangent to $f$ at $x = p$ is $y = ${poly([m, Y - m * p.pt])}$. Find the values of $p$ and $c$. **[8]**`];
    },
    a: function (p) {
      var m = 2 * p.a * p.pt + p.b, Y = p.a * p.pt * p.pt + p.b * p.pt + p.c;
      return [
        L`$f'(x) = ${poly([2 * p.a, p.b])}$ {A1}`,
        L`$${poly([2 * p.a, p.b], 'p')} = ${m}$ {M1}, $p = ${p.pt}$ {A1}`,
        L`On the tangent at $x = ${p.pt}$: $y = ${m}(${p.pt}) ${signed(Y - m * p.pt)} = ${Y}$ {M1}{A1}`,
        L`$f(${p.pt}) = ${p.a * p.pt * p.pt + p.b * p.pt} + c = ${Y}$ {M1}{A1}`,
        L`$c = ${p.c}$ {A1}`
      ];
    },
    check: function (p) {
      var m = 2 * p.a * p.pt + p.b, n = p.a * p.pt * p.pt + p.b * p.pt + p.c - m * p.pt;
      var f = function (x) { return p.a * x * x + p.b * x + p.c; }, h = 1e-6;
      return Math.abs((f(p.pt + h) - f(p.pt - h)) / (2 * h) - m) < 1e-4 && near(f(p.pt), m * p.pt + n);
    }
  };

  // Conditional probability: find P(B)
  T.g12c1p5q4 = {
    gen: function (R) {
      return retry(R, function (R) {
        var PB = pick(R, [0.2, 0.25, 0.3, 0.4, 0.5, 0.6]), r = pick(R, [0.1, 0.2, 0.25, 0.3, 0.4, 0.5]), PA = ri(R, 4, 12) * 0.05;
        var AB = r * PB, U = PA + PB - AB;
        if (AB > PA - 1e-9 || U > 1 - 1e-9 || Math.abs(U * 1000 - Math.round(U * 1000)) > 1e-6) return null;
        return { PA: +PA.toFixed(2), PB: PB, r: r, U: +U.toFixed(3) };
      });
    },
    q: function (p) {
      return [L`Events $A$ and $B$ are such that $P(A) = ${p.PA}$, $P(A \mid B) = ${p.r}$ and $P(A \cup B) = ${p.U}$. Find $P(B)$. **[5]**`];
    },
    a: function (p) {
      return [
        L`$P(A \cap B) = P(A \mid B)P(B) = ${p.r}P(B)$ {M1}`,
        L`$P(A \cup B) = P(A) + P(B) - P(A \cap B)$ {M1}`,
        L`$${p.U} = ${p.PA} + P(B) - ${p.r}P(B)$ {A1}`,
        L`$${num(1 - p.r)}P(B) = ${num(p.U - p.PA)}$ {A1}`,
        L`$P(B) = ${num(p.PB)}$ {A1}`
      ];
    },
    check: function (p) { return near((p.U - p.PA) / (1 - p.r), p.PB); }
  };

  // Normal to e^{kx} at (0, 1)
  T.g12c2p1q4 = {
    gen: function (R) { return { k: pick(R, [-4, -3, -2, 2, 3, 4, 5, 6]) }; },
    q: function (p) {
      return [L`Let $f(x) = e^{${p.k}x}$. The line $L$ is normal to the curve of $f$ at $(0, 1)$. Find the equation of $L$ in the form $y = mx + b$. **[5]**`];
    },
    a: function (p) {
      var m = fr(-1, p.k), mc = frc(-1, p.k);
      return [
        L`$f'(x) = ${p.k}e^{${p.k}x}$ {A1}`,
        L`$f'(0) = ${p.k}$ {A1}`,
        L`Normal gradient $= ${m}$ {M1}`,
        L`$y - 1 = ${mc}x$ {M1}`,
        L`$y = ${mc}x + 1$ {A1}`
      ];
    },
    check: function (p) {
      var h = 1e-6, slope = (Math.exp(p.k * h) - Math.exp(-p.k * h)) / (2 * h);
      return Math.abs(slope * (-1 / p.k) + 1) < 1e-6;
    }
  };

  // Particle: acceleration when velocity is zero
  T.g12c2p2q3 = {
    gen: function (R) {
      return retry(R, function (R) {
        var r = ri(R, 1, 4), q = ri(R, 1, 6), d = ri(R, -5, 5);
        if ((q - 3 * r) % 2) return null;
        return { r: r, q: q, d: d, b: (q - 3 * r) / 2 };
      });
    },
    q: function (p) {
      return [L`The distance $s$ metres after time $t$ seconds covered by a particle moving along a straight line is given by $s = ${poly([1, p.b, -p.q * p.r, p.d], 't')}$. Determine the acceleration of the particle when the velocity is zero. **[5]**`];
    },
    a: function (p) {
      return [
        L`$v = ${poly([3, 2 * p.b, -p.q * p.r], 't')}$ {A1}`,
        L`$(3t + ${p.q})(t - ${p.r}) = 0 \Rightarrow t = ${p.r}$ ($t \ge 0$) {M1}{A1}`,
        L`$a = ${poly([6, 2 * p.b], 't')}$ {A1}`,
        L`$a(${p.r}) = ${3 * p.r + p.q}\ \text{m/s}^2$ {A1}`
      ];
    },
    check: function (p) {
      var v = 3 * p.r * p.r + 2 * p.b * p.r - p.q * p.r;
      return near(v, 0) && near(6 * p.r + 2 * p.b, 3 * p.r + p.q);
    }
  };

  // Normal to y = x^2 - k/x
  T.g12c2p2q4 = {
    gen: function (R) {
      return retry(R, function (R) {
        var m = pick(R, [1, 2, -1, -2]), j = ri(R, 1, 6), k = m * m * j, M = 2 * m + j;
        if (M === 0) return null;
        return { m: m, k: k, M: M, Y: m * m - k / m };
      });
    },
    q: function (p) { return [L`Find the equation of the normal line to $y = x^2 - \dfrac{${p.k}}{x}$ at the point $x = ${p.m}$. **[6]**`]; },
    a: function (p) {
      var cnum = p.Y * p.M + p.m;
      var cTex = cnum === 0 ? '' : (cnum * p.M < 0 ? ' - ' : ' + ') + fr(Math.abs(cnum), Math.abs(p.M));
      return [
        L`$y' = 2x + \dfrac{${p.k}}{x^2}$ {A1}`,
        L`$y'(${p.m}) = ${p.M}$ {A1}`,
        L`$y(${p.m}) = ${num(p.Y)}$ {A1}`,
        L`Normal gradient $${fr(-1, p.M)}$ {M1}`,
        L`$${lin('y', -p.Y)} = ${frc(-1, p.M)}(${lin('x', -p.m)})$ {M1}`,
        L`$y = ${frc(-1, p.M)}x${cTex}$ {A1}`
      ];
    },
    check: function (p) {
      var h = 1e-6, f = function (x) { return x * x - p.k / x; };
      return Math.abs((f(p.m + h) - f(p.m - h)) / (2 * h) - p.M) < 1e-4 && near(f(p.m), p.Y);
    }
  };

  // Cubic: derivative value and tangent
  T.g12c2p5q1 = {
    gen: function (R) { return { b: nz(R, -6, 6), c: ri(R, -10, 10), x0: pick(R, [-2, -1, 1, 2, 3]) }; },
    q: function (p) {
      return [
        L`Consider $f(x) = ${poly([1, p.b, 0, p.c])}$.`,
        L`(a) Find $f'(${p.x0})$. **[2]**`,
        L`(b) Find the equation of the tangent to the graph of $f$ at $x = ${p.x0}$. **[2]**`
      ];
    },
    a: function (p) {
      var m = 3 * p.x0 * p.x0 + 2 * p.b * p.x0, Y = Math.pow(p.x0, 3) + p.b * p.x0 * p.x0 + p.c;
      return [
        L`(a) $f'(x) = ${poly([3, 2 * p.b, 0])}$ {M1}; $f'(${p.x0}) = ${m}$ {A1}`,
        L`(b) $f(${p.x0}) = ${Y}$, so $${lin('y', -Y)} = ${m}(${lin('x', -p.x0)})$ {M1}`,
        L`$y = ${poly([m, Y - m * p.x0])}$ {A1}`
      ];
    },
    check: function (p) {
      var f = function (x) { return x * x * x + p.b * x * x + p.c; }, h = 1e-6;
      return Math.abs((f(p.x0 + h) - f(p.x0 - h)) / (2 * h) - (3 * p.x0 * p.x0 + 2 * p.b * p.x0)) < 1e-4;
    }
  };

  // Ripple: related rates
  T.g12c2p5q6 = {
    gen: function (R) { return { u: pick(R, [0.5, 1, 1.5, 2, 3]), r: ri(R, 2, 10) }; },
    q: function (p) {
      return [L`A stone is thrown into a pond and a circular ripple spreads over the pond. Its radius is increasing at a rate of ${p.u} m/sec. How fast is the area of the circle increasing at the instant when the radius is ${p.r} m? **[6]**`];
    },
    a: function (p) {
      return [
        L`$A = \pi r^2$ {A1}`,
        L`$\dfrac{dA}{dt} = 2\pi r\dfrac{dr}{dt}$ {M1}{A1}`,
        L`$= 2\pi(${p.r})(${p.u})$ {M1}`,
        L`$= ${num(2 * p.r * p.u)}\pi\ \text{m}^2/\text{s}$ {A1}{A1}`
      ];
    },
    check: function (p) { var h = 1e-6, A = function (t) { var r = p.r + p.u * t; return Math.PI * r * r; }; return Math.abs((A(h) - A(-h)) / (2 * h) - 2 * Math.PI * p.r * p.u) < 1e-4; }
  };

  // f' = g' with products of e^x
  T.g12c2p5q5 = {
    gen: function (R) { return { a: ri(R, 1, 9) }; },
    q: function (p) {
      return [L`Let $f(x) = x^2 e^x$ and $g(x) = (x + ${p.a})e^x$. Solve $f'(x) = g'(x)$ for $x \in \mathbb{R}$. **[6]**`];
    },
    a: function (p) {
      var D = 4 * p.a + 5, s = surd(D);
      var ans = s.r === 1 ? L`$x = ${(-1 + s.k) / 2}$ or $x = ${(-1 - s.k) / 2}$` : L`$x = \dfrac{-1 \pm ${sq(D)}}{2}$`;
      return [
        L`$f'(x) = (2x + x^2)e^x$ {M1}{A1}`,
        L`$g'(x) = e^x + (x + ${p.a})e^x = (x + ${p.a + 1})e^x$ {A1}`,
        L`$e^x \ne 0$: $x^2 + 2x = x + ${p.a + 1}$ {M1}`,
        L`$x^2 + x - ${p.a + 1} = 0$ {A1}`,
        ans + ' {A1}'
      ];
    },
    check: function (p) {
      var D = 4 * p.a + 5;
      return [(-1 + Math.sqrt(D)) / 2, (-1 - Math.sqrt(D)) / 2].every(function (x) {
        return near((2 * x + x * x) * Math.exp(x), (x + p.a + 1) * Math.exp(x));
      });
    }
  };

  // s = k/t, acceleration at a given displacement
  T.g12c2p1q6 = {
    gen: function (R) { return { k: pick(R, [1, 2, 3, 4, 6]), t: pick(R, [2, 3, 4]) }; },
    q: function (p) {
      return [L`A body is moving in a straight line. Its displacement, in metres, from a fixed point O is represented by $s(t) = \dfrac{${p.k}}{t}$, $t > 0$. Find the acceleration of the body when it is $${fr(p.k, p.t)}$ m from O. **[6]**`];
    },
    a: function (p) {
      return [
        L`$\dfrac{${p.k}}{t} = ${fr(p.k, p.t)} \Rightarrow t = ${p.t}$ {M1}{A1}`,
        L`$v = -${p.k}t^{-2}$ {A1}`,
        L`$a = ${2 * p.k}t^{-3}$ {A1}`,
        L`$a(${p.t}) = \dfrac{${2 * p.k}}{${p.t * p.t * p.t}}$ {M1}`,
        L`$= ${fr(2 * p.k, p.t * p.t * p.t)}\ \text{m/s}^2$ {A1}`
      ];
    },
    check: function (p) { var h = 1e-4, s = function (t) { return p.k / t; }; return Math.abs((s(p.t + h) - 2 * s(p.t) + s(p.t - h)) / (h * h) - 2 * p.k / Math.pow(p.t, 3)) < 1e-3; }
  };

  // ---------- rendering (mirrors build.py's inline markup)
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function inline(t) {
    var maths = [];
    t = t.replace(/\$[^$]+\$/g, function (m) { maths.push(m); return '\u0000' + (maths.length - 1) + '\u0000'; });
    t = esc(t)
      .replace(/\*\*(\[\d+\])\*\*/g, '<span class="mk">$1</span>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(?!\s)([^*]+?)\*/g, function (m, b) { return '<em' + (/^[(\[]/.test(b) ? ' class="note"' : '') + '>' + b + '</em>'; })
      .replace(/\{((?:[MARN]\d)|AG)\}/g, '<span class="ms">$1</span>')
      .replace(/ {2,}/g, '<span class="gap"></span>');
    return t.replace(/\u0000(\d+)\u0000/g, function (m, i) { return esc(maths[+i]); });
  }
  function render(lines) {
    return lines.map(function (b) {
      var cls = /^\([a-z]\) /.test(b) ? 'p part' : /^(i|ii|iii|iv|v)\. /.test(b) ? 'p sub' : 'p';
      return '<p class="' + cls + '">' + inline(b) + '</p>';
    }).join('\n');
  }
  function plainCopy(lines) {
    return lines.map(function (l) { return l.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(?!\s)([^*]+?)\*/g, '$1'); }).join('\n\n');
  }

  window.VARIANTS = {
    has: function (id) { return Object.prototype.hasOwnProperty.call(T, id); },
    ids: function () { return Object.keys(T); },
    // returns {html, ans, copyBody} for question id with the given seed
    make: function (id, seed) {
      var t = T[id], p = t.gen(rng(seed)), q = t.q(p);
      return { html: render(q), ans: render(t.a(p)), copyBody: plainCopy(q), params: p };
    },
    // stress test: returns [{id, failures, errors}] over n seeds per template
    selfTest: function (n) {
      return Object.keys(T).map(function (id) {
        var fails = 0, errs = [];
        for (var s = 1; s <= n; s++) {
          try {
            var t = T[id], p = t.gen(rng(s * 7919));
            t.q(p); t.a(p);
            if (!t.check(p)) fails++;
          } catch (e) { errs.push(String(e)); }
        }
        return { id: id, failures: fails, errors: errs.slice(0, 3) };
      });
    },
    _rng: rng
  };
})();
