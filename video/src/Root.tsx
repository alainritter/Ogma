import { Composition } from "remotion";
import { DURATION, FPS, HEIGHT, Showcase, WIDTH } from "./Showcase";

export const Root = () => (
  <>
    <Composition id="OgmaShowcase" component={Showcase} defaultProps={{ dark: false }} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
    <Composition id="OgmaShowcaseDark" component={Showcase} defaultProps={{ dark: true }} durationInFrames={DURATION} fps={FPS} width={WIDTH} height={HEIGHT} />
  </>
);
