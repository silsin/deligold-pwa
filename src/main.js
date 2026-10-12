import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { applyPalette, loadPaletteId } from './theme'
import { openLogin } from './utils/authGate'
import './style.css'
import './assets/material-icons.css'

// Paint the stored palette before the first render so there is no colour flash.
applyPalette(loadPaletteId())

const app = createApp(App)

// `openLogin()` is a Vue global so any template (tab bar, drawer, gate CTAs)
// can raise the login sheet without importing the gate module.
app.config.globalProperties.openLogin = openLogin

app.use(createPinia()).use(router).mount('#app')
