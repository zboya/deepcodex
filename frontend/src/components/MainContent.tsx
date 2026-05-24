import React, { useState } from 'react';
import InputArea from './InputArea';
import ConnectorCard from './ConnectorCard';
import { SlackIcon, GithubIcon, LinearIcon, Minimize, Maximize } from './Icons';

interface MainContentProps {
  onSend: (text: string) => void;
}

const MainContent: React.FC<MainContentProps> = ({ onSend }) => {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  return (
    <main className="main">
      {/* 右上窗口控制 */}
      <div className="main-titlebar">
        <button className="icon-btn" title="最小化">
          <Minimize size={14} />
        </button>
        <button className="icon-btn" title="最大化">
          <Maximize size={12} />
        </button>
      </div>

      <div className="main-inner">
        <h1 className="hero-title">我们该做什么？</h1>

        <InputArea
          value={text}
          onChange={setText}
          onSubmit={handleSubmit}
        />

        <div className="connector-row">
          <ConnectorCard
            icon={<SlackIcon size={26} />}
            title="连接消息传送"
            desc="了解工程对话线程动态"
          />
          <ConnectorCard
            icon={<GithubIcon size={26} />}
            title="连接 GitHub"
            desc="审查 PR、代码和 CI 检查项"
          />
          <ConnectorCard
            icon={<LinearIcon size={26} />}
            title="连接 Linear"
            desc="跟踪缺陷和实施工作"
          />
        </div>
      </div>
    </main>
  );
};

export default MainContent;
