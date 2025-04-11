# MCP - Model Control Protocol

Chrome 브라우저를 제어하기 위한 Model Control Protocol (MCP) 구현입니다.

## 구성 요소

이 프로젝트는 다음 두 가지 주요 구성 요소로 이루어져 있습니다:

1. **mcp-client**: Chrome 확장 프로그램으로, 브라우저와 서버 간의 인터페이스 역할을 합니다.
2. **mcp-server**: TypeScript로 구현된 서버로, MCP 프로토콜을 통해 클라이언트에 명령을 전송하고 ModelContextProtocol SDK를 통해 AI 모델과 통신합니다.

## 설치 및 사용 방법

### mcp-client (Chrome 확장 프로그램)

1. `mcp-client` 디렉토리로 이동합니다.
2. Chrome 브라우저에서 `chrome://extensions/`로 이동합니다.
3. 개발자 모드를 활성화합니다.
4. "압축해제된 확장 프로그램을 로드합니다" 버튼을 클릭하고 `mcp-client` 디렉토리를 선택합니다.

### mcp-server (TypeScript 서버)

1. `mcp-server` 디렉토리로 이동합니다.
2. 필요한 의존성을 설치합니다:
   ```
   npm install
   ```
3. TypeScript 코드를 컴파일합니다:
   ```
   npm run build
   ```
4. 서버를 시작합니다:
   ```
   npm start
   ```

## 아키텍처

이 시스템은 다음과 같은 아키텍처로 구성됩니다:

```
AI 모델 <-- stdio --> MCP 서버 <-- WebSocket --> Chrome 확장 프로그램 <--> 웹 페이지
```

1. AI 모델은 표준 입출력(stdio)을 통해 MCP 서버와 통신합니다.
2. MCP 서버는 WebSocket을 통해 Chrome 확장 프로그램에 명령을 전송합니다.
3. Chrome 확장 프로그램은 웹 페이지의 DOM을 조작하거나 브라우저 API를 호출합니다.

## 주요 기능

- **브라우저 제어**: 페이지 이동, 요소 클릭, 텍스트 입력 등
- **콘텐츠 추출**: 웹 페이지 또는 요소의 내용 가져오기
- **스크립트 실행**: 웹 페이지 컨텍스트에서 JavaScript 실행
- **DOM 관찰**: 페이지의 변경 사항 추적
- **AI 모델 통합**: ModelContextProtocol SDK를 통한 AI 모델과의 쉬운 통합

## 기술 스택

- **클라이언트**: JavaScript, Chrome Extension API
- **서버**: TypeScript, Express, WebSocket, ModelContextProtocol SDK
- **통신**: WebSocket, HTTP REST API, stdio

## 상세 정보

각 구성 요소에 대한 자세한 정보는 해당 디렉토리의 README 파일을 참조하세요:

- [mcp-client README](mcp-client/README.md)
- [mcp-server README](mcp-server/README.md)

## 라이선스

MIT 