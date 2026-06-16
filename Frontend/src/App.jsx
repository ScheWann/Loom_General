import { GeneralTrajectoryGlyph } from "./GeneralTrajectoryGlyph.jsx";
import { COLOR_BREWER2_PALETTE_TRAJECTORY_ALT } from "./Utils.js";
import demoDataA from "./data/contrails2MaxClusterGlyph.json";
import demoDataB from "./data/climateGlyph.json";

// The climate glyph (demoDataB) uses a distinct trajectory palette so its
// lower-semicircle curves don't reuse the contrail glyph's colors.
const glyphDatasets = [
  { data: demoDataA },
  { data: demoDataB, trajectoryColors: COLOR_BREWER2_PALETTE_TRAJECTORY_ALT },
];

function App() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100vh",
          display: "flex",
          gap: 16,
          padding: 16,
          boxSizing: "border-box",
        }}
      >
        {glyphDatasets.map(({ data: demoData, trajectoryColors }, index) => (
          <div
            key={`${demoData?.paths?.[0]?.label || "dataset"}-${index}`}
            style={{
              width: "min(90vmin, 560px)",
              height: "min(90vmin, 560px)",
              maxWidth: "100%",
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <GeneralTrajectoryGlyph
              demoData={demoData}
              trajectoryColors={trajectoryColors}
              title={demoData?.paths?.[0]?.label || `Dataset ${index + 1}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
