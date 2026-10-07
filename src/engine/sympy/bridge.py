# CalSci SymPy bridge.
#
# MathJSON arrives as JSON *data* and is converted node by node through the
# allowlists below. Unknown heads raise. User text is never evaluated as
# Python and `sympify` is never called on strings (spec §5.3, §10).
import json
import re
import sympy as sp

NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


class Unsupported(Exception):
    pass


CONSTANTS = {
    "Pi": sp.pi,
    "ExponentialE": sp.E,
    "ImaginaryUnit": sp.I,
    "PositiveInfinity": sp.oo,
    "NegativeInfinity": -sp.oo,
    "ComplexInfinity": sp.zoo,
    "Half": sp.Rational(1, 2),
    "True": sp.true,
    "False": sp.false,
}

FN1 = {
    "Sin": sp.sin, "Cos": sp.cos, "Tan": sp.tan, "Cot": sp.cot, "Sec": sp.sec, "Csc": sp.csc,
    "Arcsin": sp.asin, "Arccos": sp.acos, "Arctan": sp.atan, "Arccot": sp.acot, "Arcsec": sp.asec, "Arccsc": sp.acsc,
    "Sinh": sp.sinh, "Cosh": sp.cosh, "Tanh": sp.tanh, "Coth": sp.coth, "Sech": sp.sech, "Csch": sp.csch,
    "Arsinh": sp.asinh, "Arcosh": sp.acosh, "Artanh": sp.atanh, "Arcoth": sp.acoth,
    "Ln": sp.log, "Exp": sp.exp, "Sqrt": sp.sqrt, "Abs": sp.Abs, "Floor": sp.floor, "Ceil": sp.ceiling,
    "Factorial": sp.factorial, "Gamma": sp.gamma, "Erf": sp.erf, "Sign": sp.sign,
    "Real": sp.re, "Imaginary": sp.im, "Conjugate": sp.conjugate, "Arg": sp.arg, "Heaviside": sp.Heaviside,
}

ANGLE_FACTOR = {"rad": sp.Integer(1), "deg": sp.pi / 180, "grad": sp.pi / 200}
TRIG = {"Sin", "Cos", "Tan", "Cot", "Sec", "Csc"}
INV_TRIG = {"Arcsin", "Arccos", "Arctan", "Arccot", "Arcsec", "Arccsc"}


class Converter:
    def __init__(self, angle="rad", ode_fn=None, ode_var=None):
        self.angle = angle
        self.ode_fn = ode_fn  # name of the unknown function in an ODE
        self.ode_var = ode_var

    def symbol(self, name):
        if not isinstance(name, str) or not NAME_RE.match(name):
            raise Unsupported(f"Invalid symbol name")
        if name.endswith("_upright"):
            name = name[: -len("_upright")]
        if self.ode_fn and name == self.ode_fn:
            return sp.Function(name)(self.ode_var)
        return sp.Symbol(name)

    def number(self, s):
        if not re.match(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$", s):
            raise Unsupported("Unsupported number format")
        return sp.Rational(s) if len(s.replace("-", "").replace(".", "")) <= 30 else sp.Float(s, 50)

    def conv(self, node):
        if isinstance(node, bool):
            return sp.true if node else sp.false
        if isinstance(node, int):
            return sp.Integer(node)
        if isinstance(node, float):
            return self.number(repr(node))
        if isinstance(node, str):
            if node in CONSTANTS:
                return CONSTANTS[node]
            if node.startswith("'"):
                raise Unsupported("Text is not allowed in expressions")
            return self.symbol(node)
        if isinstance(node, dict):
            if "num" in node:
                return self.number(node["num"])
            if "sym" in node:
                return self.conv(node["sym"])
            if "fn" in node:
                return self.conv(node["fn"])
            raise Unsupported("Unknown node")
        if not isinstance(node, list) or not node or not isinstance(node[0], str):
            raise Unsupported("Malformed expression")
        head, args = node[0], node[1:]
        c = self.conv

        if head == "Add":
            return sp.Add(*[c(a) for a in args])
        if head == "Subtract":
            return c(args[0]) - c(args[1])
        if head == "Negate":
            return -c(args[0])
        if head == "Multiply":
            return sp.Mul(*[c(a) for a in args])
        if head == "Divide":
            return c(args[0]) / c(args[1])
        if head == "Power":
            return c(args[0]) ** c(args[1])
        if head == "Root":
            return sp.root(c(args[0]), c(args[1]))
        if head == "Rational":
            return sp.Rational(c(args[0]), c(args[1]))
        if head == "Complex":
            return c(args[0]) + sp.I * c(args[1])
        if head == "Log":
            return sp.log(c(args[0]), c(args[1]) if len(args) > 1 else 10)
        if head == "Lb":
            return sp.log(c(args[0]), 2)
        if head in TRIG:
            return FN1[head](c(args[0]) * ANGLE_FACTOR[self.angle])
        if head in INV_TRIG:
            return FN1[head](c(args[0])) / ANGLE_FACTOR[self.angle]
        if head in FN1:
            return FN1[head](*[c(a) for a in args])
        if head in ("Binomial", "Choose"):
            return sp.binomial(c(args[0]), c(args[1]))
        if head == "Max":
            return sp.Max(*[c(a) for a in args])
        if head == "Min":
            return sp.Min(*[c(a) for a in args])
        if head == "Mod":
            return sp.Mod(c(args[0]), c(args[1]))
        if head in ("Delimiter", "Hold", "Block"):
            return c(args[0])
        if head == "Equal":
            return sp.Eq(c(args[0]), c(args[1]))
        if head in ("List", "Tuple", "Sequence"):
            return [c(a) for a in args]
        if head == "Matrix":
            return sp.Matrix(c(args[0]))
        if head == "Function":
            return c(args[0])
        if head == "Prime":
            order = int(args[1]) if len(args) > 1 else 1
            if not self.ode_fn:
                raise Unsupported("Derivative notation needs an equation")
            return sp.Derivative(self.symbol(args[0]), self.ode_var, order)
        if head == "D":
            f = c(args[0])
            return sp.diff(f, *[self.symbol(v) for v in args[1:]])
        if head == "Integrate":
            return self.integrate(args)
        if head == "Limit":
            return self.limit(args)
        if head in ("Sum", "Product"):
            body = c(args[0])
            lim = args[1]
            spec = (self.symbol(lim[1]), c(lim[2]), c(lim[3]))
            return sp.summation(body, spec) if head == "Sum" else sp.product(body, spec)
        raise Unsupported(f"{head} is not supported by the symbolic engine")

    def limits(self, lim):
        if isinstance(lim, list) and lim and lim[0] == "Limits":
            var = self.symbol(lim[1])
            lo = None if lim[2] == "Nothing" else self.conv(lim[2])
            hi = None if lim[3] == "Nothing" else self.conv(lim[3])
            return var, lo, hi
        return self.symbol(lim), None, None

    def integrate(self, args):
        f = self.conv(args[0])
        if len(args) < 2:
            var = guess_var(f)
            return sp.integrate(f, var)
        var, lo, hi = self.limits(args[1])
        if lo is None or hi is None:
            return sp.integrate(f, var)
        return sp.integrate(f, (var, lo, hi))

    def limit(self, args):
        fn = args[0]
        var = sp.Symbol(fn[2]) if isinstance(fn, list) and fn[0] == "Function" and len(fn) > 2 else None
        f = self.conv(fn)
        if var is None:
            var = guess_var(f)
        point = self.conv(args[1])
        direction = "+-"
        if len(args) > 2:
            direction = "+" if args[2] == 1 else "-"
        return sp.limit(f, var, point, direction)


def guess_var(expr):
    free = sorted(getattr(expr, "free_symbols", set()), key=lambda s: s.name)
    for preferred in ("x", "t", "y", "z"):
        for s in free:
            if s.name == preferred:
                return s
    if not free:
        return sp.Symbol("x")
    return free[0]


def find_prime(node):
    """Return the function name used with Prime (y', y'') if any."""
    if isinstance(node, list) and node:
        if node[0] == "Prime" and isinstance(node[1], str):
            return node[1]
        for a in node[1:]:
            r = find_prime(a)
            if r:
                return r
    return None


def mentions(node, name):
    if node == name:
        return True
    if isinstance(node, list):
        return any(mentions(a, name) for a in node[1:])
    return False


def fmt_solutions(var, sols):
    if not sols:
        return None
    return r",\; ".join(f"{sp.latex(var)}={sp.latex(s)}" for s in sols)


def numeric(expr, digits):
    try:
        if getattr(expr, "free_symbols", None) == set() and expr.is_number:
            v = sp.N(expr, digits)
            return str(v)
    except Exception:
        pass
    return None


def run(payload_json):
    p = json.loads(payload_json)
    op = p["op"]
    args = p["args"]
    digits = int(p.get("digits", 30))
    complex_mode = p.get("complex", False)
    conv = Converter(angle=p.get("angle", "rad"))
    result = None
    latex = None

    if op == "dsolve":
        eq_node = args[0]
        fn = find_prime(eq_node)
        if not fn:
            raise Unsupported("Write the ODE with y′ or y″, for example y″ + y = 0")
        var_name = "t" if mentions(eq_node, "t") and not mentions(eq_node, "x") else "x"
        conv = Converter(angle="rad", ode_fn=fn, ode_var=sp.Symbol(var_name))
        eq = conv.conv(eq_node)
        if not isinstance(eq, sp.Equality):
            eq = sp.Eq(eq, 0)
        result = sp.dsolve(eq)
        if isinstance(result, list):
            latex = r",\; ".join(sp.latex(r) for r in result)
        else:
            latex = sp.latex(result)
        return json.dumps({"latex": latex})

    vals = [conv.conv(a) for a in args]

    if op == "integrate" or op == "limit" or op == "eval":
        result = vals[0]
    elif op == "diff":
        result = sp.diff(vals[0], *(vals[1:] or [guess_var(vals[0])]))
    elif op == "simplify":
        result = sp.simplify(vals[0])
    elif op == "expand":
        result = sp.expand(vals[0])
    elif op == "factor":
        result = sp.factor(vals[0])
    elif op == "series":
        f = vals[0]
        var = vals[1] if len(vals) > 1 else guess_var(f)
        x0 = vals[2] if len(vals) > 2 else 0
        n = int(vals[3]) if len(vals) > 3 else 6
        result = sp.series(f, var, x0, n)
    elif op == "laplace":
        f = vals[0]
        t = vals[1] if len(vals) > 1 else sp.Symbol("t")
        s = vals[2] if len(vals) > 2 else sp.Symbol("s")
        result = sp.laplace_transform(f, t, s, noconds=True)
    elif op == "solve":
        target = vals[0]
        eqs = target if isinstance(target, list) else [target]
        eqs = [e if isinstance(e, sp.Equality) else sp.Eq(e, 0) for e in eqs]
        free = set()
        for e in eqs:
            free |= e.free_symbols
        if len(vals) > 1:
            unknowns = vals[1] if isinstance(vals[1], list) else [vals[1]]
        else:
            unknowns = sorted(free, key=lambda s: s.name)
        if not unknowns:
            raise Unsupported("Nothing to solve for")
        if len(eqs) == 1 and len(unknowns) == 1:
            var = unknowns[0]
            sols = sp.solve(eqs[0], var)
            if not complex_mode:
                real = [s for s in sols if s.is_real is not False]
                if sols and not real:
                    return json.dumps({"error": {"code": "no-real-solution",
                                                 "message": "No real solution. Switch to complex mode to see complex roots."}})
                sols = real
            if not sols:
                return json.dumps({"error": {"code": "no-solution", "message": "No solution found"}})
            latex = fmt_solutions(var, sols)
            approx = None
            if all(s.is_number for s in sols):
                approx = ", ".join(str(sp.N(s, digits)) for s in sols)
            return json.dumps({"latex": latex, "approx": approx})
        sols = sp.solve(eqs, unknowns, dict=True)
        if not sols:
            return json.dumps({"error": {"code": "no-solution", "message": "No solution found"}})
        parts = []
        for sol in sols:
            parts.append(r",\; ".join(f"{sp.latex(k)}={sp.latex(v)}" for k, v in sol.items()))
        return json.dumps({"latex": r"\quad\text{or}\quad ".join(parts)})
    else:
        raise Unsupported(f"Unknown operation {op}")

    if isinstance(result, sp.Integral) or isinstance(result, sp.Limit):
        return json.dumps({"error": {"code": "unevaluated", "message": "No closed form found"}})
    latex = sp.latex(result)
    return json.dumps({"latex": latex, "approx": numeric(result, digits)})


def handle(payload_json):
    try:
        return run(payload_json)
    except Unsupported as e:
        return json.dumps({"error": {"code": "unsupported", "message": str(e)}})
    except NotImplementedError as e:
        return json.dumps({"error": {"code": "not-implemented", "message": str(e) or "SymPy can't do this one"}})
    except Exception as e:  # noqa: BLE001
        return json.dumps({"error": {"code": "sympy-error", "message": f"{type(e).__name__}: {e}"}})
