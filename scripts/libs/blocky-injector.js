// @ts-nocheck
let Inject;
(() => {
  var e = {
      138(e, t, n) {
        "use strict";
        (Object.defineProperty(t, "__esModule", { value: !0 }),
          (t.BlocklyInjector = void 0));
        const i = n(546),
          o = n(532);
        t.BlocklyInjector = class {
          extension;
          runtime;
          blockly;
          get availableBlocks() {
            return (
              this.extension
                .getInfo()
                .blocks?.filter((e) => "string" != typeof e)
                .filter(this.isAvailableBlock) ?? []
            );
          }
          constructor(e) {
            if (!e) throw new i.InjectionError("no extension given.");
            if (!e.runtime)
              throw new i.InjectionError(
                `no runtime found in ${e.getInfo().id}.`,
              );
            ((this.runtime = e.runtime), (this.extension = e));
            const t = (0, o.obtainBlockly)(this.runtime);
            (t || console.error("nothing blockliable found."),
              (this.blockly = t));
          }
          findAvaliable(e) {
            return (
              this.availableBlocks.find(
                (t) => e === `${this.extension.getInfo().id}_${t.opcode}`,
              ) ?? null
            );
          }
          isDefinitionAvailable(e) {
            return (
              this.availableBlocks.length > 0 &&
              this.availableBlocks.some(
                (t) => e === `${this.extension.getInfo().id}_${t.opcode}`,
              )
            );
          }
          start() {
            if (!this.blockly) return;
            const e = this.extension.getInfo.bind(this.extension);
            ((this.extension.getInfo = () => {
              const t = e();
              return (
                (t.blocks =
                  t.blocks
                    ?.filter((e) => "string" != typeof e)
                    .map((e) =>
                      this.isAvailableBlock(e) ? this.configMap(e) : e,
                    ) ?? []),
                this.getInfo(t) ?? t
              );
            }),
              (this.blockly.Blocks = new Proxy(this.blockly.Blocks, {
                set: (e, t, n) => {
                  const i = n;
                  if (this.isDefinitionAvailable(t)) {
                    const e = i.init,
                      n = this;
                    i.init = function () {
                      e?.call(this);
                      const i = n.findAvaliable(t);
                      i && (n.init(this, i), n.inject(this, i));
                    };
                  }
                  return Reflect.set(e, t, i);
                },
              })));
          }
        };
      },
      546(e, t) {
        "use strict";
        (Object.defineProperty(t, "__esModule", { value: !0 }),
          (t.InjectionError = void 0));
        class n extends Error {}
        t.InjectionError = n;
      },
      532(e, t) {
        "use strict";
        function n(e, t, n, i, o = "") {
          if ("number" === n || "string" === n) {
            const s = "number" === n ? "math_number" : "text";
            i.Events.disable();
            const r = e.workspace.newBlock(s);
            try {
              ("number" === n
                ? r.setFieldValue(o, "NUM")
                : r.setFieldValue(o, "TEXT"),
                r.setShadow(!0),
                e.isInsertionMarker() || (r.initSvg(), r.render(!1)));
            } finally {
              i.Events.enable();
            }
            (i.Events.isEnabled() && i.Events.fire(new i.Events.BlockCreate(r)),
              r.outputConnection?.connect(t.connection));
          }
        }
        (Object.defineProperty(t, "__esModule", { value: !0 }),
          (t.attachShadow = n),
          (t.appendArgumentInput = async function (e, t, i, o, s) {
            return new Promise((r) => {
              const l = e.appendValueInput(t).appendField(i);
              (n(e, l, "string", o, String(s)),
                setTimeout(() => {
                  (l.setVisible(!1), e.render(), r(l));
                }, 0));
            });
          }),
          (t.obtainBlockly = function (e) {
            if (!e) return window.ScratchBlocks || null;
            if (e.scratchBlocks) return e.scratchBlocks;
            if (e.vm && e.vm.scratchBlocks) return e.vm.scratchBlocks;
            if (e.vm && e.vm.runtime && e.vm.runtime.scratchBlocks)
              return e.vm.runtime.scratchBlocks;
            return window.ScratchBlocks || null;
          }));
      },
      486(e, t, n) {
        "use strict";
        Object.defineProperty(t, "__esModule", { value: !0 });
        const i = n(138),
          o = n(532);
        class s extends i.BlocklyInjector {
          isAvailableBlock(e) {
            return Object.hasOwn(e, "fields");
          }
          configMap(e) {
            return e;
          }
          getInfo(e) {
            return e;
          }
          inject(e, t) {
            for (const [n, i] of Object.entries(t.fields))
              (0, o.appendArgumentInput)(e, n, n, this.blockly, i);
          }
          init() {}
        }
        t.default = s;
      },
      46(e, t, n) {
        "use strict";
        var i =
          (this && this.__importDefault) ||
          function (e) {
            return e && e.__esModule ? e : { default: e };
          };
        (Object.defineProperty(t, "__esModule", { value: !0 }),
          (t.default = void 0));
        var o = n(486);
        Object.defineProperty(t, "default", {
          enumerable: !0,
          get: function () {
            return i(o).default;
          },
        });
      },
    },
    t = {},
    n = (function n(i) {
      var o = t[i];
      if (void 0 !== o) return o.exports;
      var s = (t[i] = { exports: {} });
      return (e[i].call(s.exports, s, s.exports, n), s.exports);
    })(46);
  Inject = n.default;
})();
