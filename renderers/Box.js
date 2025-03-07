import React from 'react';
import { Image, View } from 'react-native';

const Box = ({ body, size, color, imageSource }) => {
  const width = !isNaN(size[0]) ? size[0] : 0;
  const height = !isNaN(size[1]) ? size[1] : 0;
  const x = !isNaN(body.position.x) ? body.position.x - width / 2 : 0;
  const y = !isNaN(body.position.y) ? body.position.y - height - 100 : 0;

  if (imageSource) {
    return (
      <Image
        source={imageSource}
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: width,
          height: height,
        }}
        resizeMode="contain"
      />
    );
  }

  return (
    <View
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: width,
        height: height,
        backgroundColor: color || 'transparent', // Fallback to transparent if color is not provided
      }}
    />
  );
};

export default Box;
