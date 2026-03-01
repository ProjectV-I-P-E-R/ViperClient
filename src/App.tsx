import { Viewer, Cesium3DTileset, Globe } from "resium";
import "./App.css";
import {RequestScheduler} from "cesium";

RequestScheduler.requestsByServer["tile.googleapis.com:443"] = 18;

function App() {
  return (
    <Viewer full baseLayerPicker={false}>
      <Globe show={false} />
      <Cesium3DTileset url="https://tile.googleapis.com/v1/3dtiles/root.json?key=AIzaSyA4RchefZJO0tJu-WWbWKV1nhaI3xZdfMQ" />
    </Viewer>
  );
}

export default App;
