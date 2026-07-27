import { installMockAdapter } from './helpers/mockServer'

// Corre antes de que los archivos de test importen `src/lib/api.ts`, que es
// cuando axios.create() copia el adapter de los defaults. Ninguna petición de
// los tests sale a la red.
installMockAdapter()
