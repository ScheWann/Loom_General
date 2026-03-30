import { GeneralTrajectoryGlyph } from "./GeneralTrajectoryGlyph.jsx";

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
        {/* Left panel - Contrails */}
        <div
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
            preset="contrails2MaxCluster"
            title="Contrails"
          />
        </div>

        {/* Right panel - Climate */}
        <div
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
            preset="climate2014_2024"
            title="Climate 2014-2024"
          />
        </div>
      </div>
    </div>
  );
}

export default App;
