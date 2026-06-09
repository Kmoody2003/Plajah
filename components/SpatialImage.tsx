import React, { memo } from 'react';
import SpatialMedia from './SpatialMedia';

interface SpatialImageProps {
  url: string;
  is3D?: boolean;
}

const SpatialImage: React.FC<SpatialImageProps> = memo(({ url, is3D }) => (
  <SpatialMedia url={url} type="IMAGE" forceDepth={is3D} />
));

export default SpatialImage;
