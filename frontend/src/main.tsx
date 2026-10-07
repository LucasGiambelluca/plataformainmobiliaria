import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { BASE_PATH } from './lib/basePath'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* basename solo cuando la app no está en la raíz del host: vacío sería un
        prefijo inválido, y en la raíz el router tiene que trabajar sin ninguno. */}
    <BrowserRouter basename={BASE_PATH || undefined}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
