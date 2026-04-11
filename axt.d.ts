import { AxtContext } from './src/core/context';

declare global {
    /** 自动将 func 里的 this 绑定到框架上下文 */
    function func(this: AxtContext, args: any, util: any): any;
}