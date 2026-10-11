import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { applyPalette, loadPaletteId } from './theme'
import './style.css'
import './assets/material-icons.css'

// Paint the stored palette before the first render so there is no colour flash.
applyPalette(loadPaletteId())

createApp(App).use(createPinia()).use(router).mount('#app')
