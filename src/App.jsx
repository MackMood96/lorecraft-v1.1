import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GameProvider } from './context/GameContext'
import Splash from './pages/Splash'
import CharCreate from './pages/CharCreate'
import Lobby from './pages/Lobby'
import Game from './pages/Game'
import './index.css'

function App() {
  return (
    <GameProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/create" element={<CharCreate />} />
          <Route path="/lobby" element={<Lobby />} />
          <Route path="/game/:campaignId" element={<Game />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </GameProvider>
  )
}

export default App