import { GeneralTrajectoryGlyph } from './GeneralTrajectoryGlyph.jsx'

function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 'min(90vmin, 560px)',
          height: 'min(90vmin, 560px)',
          maxWidth: '100%',
        }}
      >
        <GeneralTrajectoryGlyph />
      </div>
    </div>
  )
}

export default App
