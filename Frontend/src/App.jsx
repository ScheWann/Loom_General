import { GeneralTrajectoryGlyph } from "./GeneralTrajectoryGlyph.jsx";
import demoDataA from "./data/contrails2MaxClusterGlyph.json";
import demoDataB from "./data/climateGlyph.json";

const glyphDatasets = [demoDataA, demoDataB];

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
        {glyphDatasets.map((demoData, index) => (
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
              title={demoData?.paths?.[0]?.label || `Dataset ${index + 1}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
