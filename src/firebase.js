import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDzuxtP6CVDf_nPekeL6kyBdPE1DoPgpNs",
  authDomain: "game-700aa.firebaseapp.com",
  projectId: "game-700aa",
  storageBucket: "game-700aa.firebasestorage.app",
  messagingSenderId: "830277933538",
  appId: "1:830277933538:web:9856d7d47ce3e41f5dc1bb",
  measurementId: "G-55L2SV349R",
  // VIKTIG: Du mangler databaseURL! Legg til denne:
  databaseURL:
    "https://game-700aa-default-rtdb.europe-west1.firebasedatabase.app/",
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
